import { state } from '../state';

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
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];
const TARGET_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = TARGET_SAMPLE_RATE; // 1 second

export function setStatusHandler(h: StatusChangeHandler) {
  onStatusChange = h;
}

function emitStatus(s: MicStatus) {
  onStatusChange?.(s);
}

export async function startAudio() {
  intentionallyStopped = false;
  retryCount = 0;
  emitStatus('requesting');

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: { ideal: TARGET_SAMPLE_RATE } },
      video: false,
    });
  } catch (err: unknown) {
    const error = err as { name?: string };
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      emitStatus('denied');
    } else {
      emitStatus('error');
    }
    return;
  }

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
          ws.send(accumulator.buffer.slice(0));
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
  if (wsRetryTimer) clearTimeout(wsRetryTimer);
  if (ws) { ws.close(1000); ws = null; }
  if (scriptProcessor) { scriptProcessor.disconnect(); scriptProcessor = null; }
  if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  emitStatus('idle');
}

function _connectWs() {
  const token = state.getToken();
  if (!token) return;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/ws/audio?token=${encodeURIComponent(token)}`;

  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => { retryCount = 0; };

  ws.onmessage = (_event) => {
    // Server sends JSON detection confirmations — ignore in audio WS handler;
    // the detections WS handles display updates
  };

  ws.onclose = (event) => {
    if (intentionallyStopped) return;
    if (event.code === 4001) return;
    _scheduleWsRetry();
  };

  ws.onerror = () => { ws?.close(); };
}

function _scheduleWsRetry() {
  if (retryCount >= RETRY_DELAYS.length) {
    emitStatus('error');
    return;
  }
  const delay = RETRY_DELAYS[retryCount++];
  wsRetryTimer = setTimeout(_connectWs, delay);
}

export async function requestMicPermission() {
  stopAudio();
  await startAudio();
}
