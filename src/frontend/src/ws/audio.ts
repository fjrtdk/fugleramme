import { state } from '../state';
import { log } from '../lib/logger';

export type MicStatus = 'idle' | 'requesting' | 'recording' | 'muted' | 'denied' | 'error';

type StatusChangeHandler = (status: MicStatus) => void;
let onStatusChange: StatusChangeHandler | null = null;

let ws: WebSocket | null = null;
let audioContext: AudioContext | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let mediaStream: MediaStream | null = null;
let intentionallyStopped = false;
let retryCount = 0;
let wsRetryTimer: ReturnType<typeof setTimeout> | null = null;
let lastConnectionAttemptTime: number | null = null;
let lastCloseCode: number | null = null;
let lastCloseReason: string | null = null;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];
const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = TARGET_SAMPLE_RATE; // 1 second

export interface AudioDiagnostics {
  sampleRate: number | null;
  state: string;
  bufferSize: number;
  frameSamples: number;
  mediaStreamActive: boolean;
  mediaStreamTrackCount: number;
  lastConnectionAttemptTime: number | null;
  lastCloseCode: number | null;
  lastCloseReason: string | null;
  retryCount: number;
}

/** Read-only snapshot of the audio pipeline and WS connection. */
export function getAudioDiagnostics(): AudioDiagnostics {
  return {
    sampleRate: audioContext?.sampleRate ?? null,
    state: audioContext?.state ?? 'closed',
    bufferSize: 4096,
    frameSamples: FRAME_SAMPLES,
    mediaStreamActive: mediaStream !== null,
    mediaStreamTrackCount: mediaStream?.getAudioTracks().length ?? 0,
    lastConnectionAttemptTime,
    lastCloseCode,
    lastCloseReason,
    retryCount,
  };
}

export function setStatusHandler(h: StatusChangeHandler) {
  onStatusChange = h;
}

function emitStatus(s: MicStatus) {
  onStatusChange?.(s);
}

/** Current WebSocket readyState for the audio connection. */
export function getAudioWsState(): number {
  return ws?.readyState ?? WebSocket.CLOSED;
}

/** Enumerate available audio input devices. Labels are only populated after microphone permission has been granted. */
export async function listAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'audioinput');
}

/** Whether the audio capture pipeline is currently active (not merely whether the WebSocket is open). */
export function isAudioRunning(): boolean {
  return audioContext !== null && !intentionallyStopped;
}

const BASE_AUDIO_CONSTRAINT: MediaTrackConstraints = {
  channelCount: 1,
  sampleRate: { ideal: TARGET_SAMPLE_RATE },
};

function buildAudioConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: deviceId
      ? { ...BASE_AUDIO_CONSTRAINT, deviceId: { exact: deviceId } }
      : BASE_AUDIO_CONSTRAINT,
    video: false,
  };
}

async function acquireAudioStream(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(buildAudioConstraints(deviceId));
}

function handleGetUserMediaError(err: unknown) {
  const error = err as { name?: string; message?: string };
  log('MIC', `getUserMedia error: ${error.name ?? 'unknown'} — ${error.message ?? ''}`);
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    emitStatus('denied');
  } else {
    emitStatus('error');
  }
}

export async function startAudio(deviceId?: string) {
  intentionallyStopped = false;
  retryCount = 0;
  emitStatus('requesting');
  log('MIC', deviceId ? `getUserMedia requesting device "${deviceId}"…` : 'getUserMedia requesting…');

  try {
    mediaStream = await acquireAudioStream(deviceId);
  } catch (err: unknown) {
    if (deviceId) {
      const error = err as { message?: string };
      log('MIC', `getUserMedia exact deviceId failed (${error.message ?? 'unknown'}); falling back to default constraints`);
      try {
        mediaStream = await acquireAudioStream();
      } catch (err2: unknown) {
        handleGetUserMediaError(err2);
        return;
      }
    } else {
      handleGetUserMediaError(err);
      return;
    }
  }

  const label = mediaStream.getAudioTracks()[0]?.label || 'unknown device';
  log('MIC', `getUserMedia success — "${label}"`);
  audioContext = new AudioContext();
  const nativeRate = audioContext.sampleRate;
  const ratio = nativeRate / TARGET_SAMPLE_RATE;

  // ScriptProcessor buffer size — must be power of 2, choose 4096
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  sourceNode = audioContext.createMediaStreamSource(mediaStream);

  // Accumulate target-rate samples
  let accumulator = new Int16Array(FRAME_SAMPLES);
  let accumulatorPos = 0;
  let fractional = 0;

  scriptProcessor.onaudioprocess = (event) => {
    if (intentionallyStopped) return;
    const input = event.inputBuffer.getChannelData(0);

    // Downsample from native rate to TARGET_SAMPLE_RATE via linear interpolation
    let srcPos = fractional;
    while (srcPos < input.length) {
      const i0 = Math.floor(srcPos);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const frac = srcPos - i0;
      const sample = input[i0]! * (1 - frac) + input[i1]! * frac;
      // Clamp and convert to Int16
      const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
      accumulator[accumulatorPos++] = intSample;

      if (accumulatorPos >= FRAME_SAMPLES) {
        // Send frame if WS is open
        if (ws && ws.readyState === WebSocket.OPEN) {
          const frameBuffer = accumulator.buffer.slice(0);
          ws.send(frameBuffer);
          log('WS_AUDIO', `sent frame (${frameBuffer.byteLength} bytes)`);
        }
        accumulatorPos = 0;
        accumulator = new Int16Array(FRAME_SAMPLES);
      }
      srcPos += ratio;
    }
    fractional = srcPos - input.length;
    if (fractional < 0) fractional = 0;
  };

  sourceNode.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  emitStatus('recording');
  _connectWs();
}

export function stopAudio() {
  intentionallyStopped = true;
  log('WS_AUDIO', 'intentionally stopped');
  if (wsRetryTimer) clearTimeout(wsRetryTimer);
  if (ws) { ws.close(1000); ws = null; }
  if (scriptProcessor) { scriptProcessor.disconnect(); scriptProcessor = null; }
  if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  emitStatus('idle');
}

/**
 * Switch the active audio input device while keeping the WebSocket and AudioContext alive.
 *
 * Strategy: stop the current MediaStream tracks, drop the old MediaStreamAudioSourceNode,
 * acquire a new stream with the requested deviceId (falling back to default if the exact
 * device is no longer available), then create a fresh MediaStreamAudioSourceNode and connect
 * it to the existing ScriptProcessorNode. The WebSocket is left open so detection continuity
 * is preserved.
 */
export async function restartAudioWithDevice(deviceId: string | null) {
  if (!audioContext || !scriptProcessor || intentionallyStopped) {
    log('MIC', `Device selection changed to ${deviceId ?? 'default'} while audio not running; will apply on next startAudio()`);
    return;
  }

  log('MIC', `Restarting audio with device ${deviceId ?? 'default'} (keeping WS open)`);
  emitStatus('requesting');

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  try {
    mediaStream = await acquireAudioStream(deviceId ?? undefined);
  } catch (err: unknown) {
    if (deviceId) {
      const error = err as { message?: string };
      log('MIC', `restart exact deviceId failed (${error.message ?? 'unknown'}); falling back to default constraints`);
      try {
        mediaStream = await acquireAudioStream();
      } catch (err2: unknown) {
        handleGetUserMediaError(err2);
        return;
      }
    } else {
      handleGetUserMediaError(err);
      return;
    }
  }

  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  sourceNode.connect(scriptProcessor);

  const label = mediaStream.getAudioTracks()[0]?.label || 'unknown device';
  log('MIC', `Audio rewired to "${label}"`);
  emitStatus('recording');
}

function _connectWs() {
  const token = state.getToken();
  if (!token) return;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/ws/audio?token=${encodeURIComponent(token)}`;
  log('WS_AUDIO', 'connecting…');
  lastConnectionAttemptTime = Date.now();

  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    retryCount = 0;
    log('WS_AUDIO', 'connected');
  };

  ws.onmessage = (event) => {
    // Server sends JSON detection confirmations — ignore in audio WS handler;
    // the detections WS handles display updates. Still log warnings/errors
    // so protocol issues (e.g. frame-size mismatches) are visible.
    try {
      const msg = JSON.parse(event.data as string);
      if (msg?.type === 'error') {
        log('WS_AUDIO', `received error: ${msg.code ?? 'unknown'} — ${msg.message ?? ''}`);
      }
    } catch {
      log('WS_AUDIO', `received unparseable message: ${String(event.data).slice(0, 200)}`);
    }
  };

  ws.onclose = (event) => {
    lastCloseCode = event.code;
    lastCloseReason = event.reason || null;
    log('WS_AUDIO', `closed (code ${event.code})`);
    if (intentionallyStopped) return;
    if (event.code === 4001) {
      log('WS_AUDIO', 'auth rejected (4001) — not retrying');
      return;
    }
    _scheduleWsRetry();
  };

  ws.onerror = () => {
    log('WS_AUDIO', 'error');
    ws?.close();
  };
}

function _scheduleWsRetry() {
  if (retryCount >= RETRY_DELAYS.length) {
    emitStatus('error');
    return;
  }
  const delay = RETRY_DELAYS[retryCount++];
  log('WS_AUDIO', `retry in ${delay}ms (attempt ${retryCount})`);
  wsRetryTimer = setTimeout(_connectWs, delay);
}

export async function requestMicPermission(deviceId?: string) {
  stopAudio();
  await startAudio(deviceId);
}
