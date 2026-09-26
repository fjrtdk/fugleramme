import type { Detection, Settings } from '../types';
import { state } from '../state';
import { log } from '../lib/logger';

type DetectionHandler = (detections: Detection[]) => void;
type SettingsHandler = (settings: Settings) => void;

let ws: WebSocket | null = null;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

let onDetection: DetectionHandler | null = null;
let onSettingsChanged: SettingsHandler | null = null;
let intentionallyClosed = false;
let lastConnectionAttemptTime: number | null = null;
let lastCloseCode: number | null = null;
let lastCloseReason: string | null = null;

export interface WsDiagnostics {
  lastConnectionAttemptTime: number | null;
  lastCloseCode: number | null;
  lastCloseReason: string | null;
  retryCount: number;
}

/** Read-only snapshot of the detections WebSocket connection. */
export function getWsDiagnostics(): WsDiagnostics {
  return {
    lastConnectionAttemptTime,
    lastCloseCode,
    lastCloseReason,
    retryCount,
  };
}

/** Current WebSocket readyState for the detections connection. */
export function getDetectionsWsState(): number {
  return ws?.readyState ?? WebSocket.CLOSED;
}

// ── Inference visibility (for the diagnostics panel) ────────────────────────
// Every detection message received counts as one inference attempt, whether
// or not it carried any actual detections. This lets the diagnostics panel
// show "inference running vs silent" without a dedicated backend endpoint.

export interface InferenceLogEntry {
  ts: number;
  detectionCount: number;
  raw: Detection[];
}

const MAX_RECENT_DETECTIONS = 100;
const MAX_INFERENCE_LOG = 100;

let lastInferenceTime: number | null = null;
let lastDetectionCount = 0;
const recentDetections: Array<Detection & { receivedAt: number }> = [];
const inferenceLog: InferenceLogEntry[] = [];

export interface DetectionsSnapshot {
  lastInferenceTime: number | null;
  lastDetectionCount: number;
  recentDetections: ReadonlyArray<Detection & { receivedAt: number }>;
  inferenceLog: ReadonlyArray<InferenceLogEntry>;
}

/** Read-only snapshot of recent inference activity, for the diagnostics panel. */
export function getDetectionsSnapshot(): DetectionsSnapshot {
  return {
    lastInferenceTime,
    lastDetectionCount,
    recentDetections,
    inferenceLog,
  };
}

function _recordInferenceAttempt(detections: Detection[]): void {
  lastInferenceTime = Date.now();
  lastDetectionCount = detections.length;

  inferenceLog.push({ ts: lastInferenceTime, detectionCount: detections.length, raw: detections });
  if (inferenceLog.length > MAX_INFERENCE_LOG) inferenceLog.shift();

  if (detections.length > 0) {
    const receivedAt = lastInferenceTime;
    for (const d of detections) {
      recentDetections.push({ ...d, receivedAt });
    }
    while (recentDetections.length > MAX_RECENT_DETECTIONS) recentDetections.shift();
    log('WS_DET', `inference: ${detections.length} detection(s)`);
  } else {
    log('WS_DET', 'inference: no detections (silent)');
  }
}

export function connectDetections(
  onDet: DetectionHandler,
  onSettings: SettingsHandler
) {
  onDetection = onDet;
  onSettingsChanged = onSettings;
  intentionallyClosed = false;
  retryCount = 0;
  _connect();
}

export function disconnectDetections() {
  intentionallyClosed = true;
  log('WS_DET', 'intentionally disconnected');
  if (retryTimer) clearTimeout(retryTimer);
  if (ws) {
    ws.close(1000);
    ws = null;
  }
}

function _connect() {
  const token = state.getToken();
  if (!token) return;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/ws/detections?token=${encodeURIComponent(token)}`;
  log('WS_DET', 'connecting…');
  lastConnectionAttemptTime = Date.now();

  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    retryCount = 0;
    log('WS_DET', 'connected');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as { type: string; detections?: Detection[]; settings?: Settings };
      if (msg.type === 'detection' && msg.detections) {
        _recordInferenceAttempt(msg.detections);
        if (onDetection) onDetection(msg.detections);
      } else if (msg.type === 'settings_changed' && onSettingsChanged && msg.settings) {
        onSettingsChanged(msg.settings);
      }
    } catch { /* ignore malformed */ }
  };

  ws.onclose = (event) => {
    lastCloseCode = event.code;
    lastCloseReason = event.reason || null;
    log('WS_DET', `closed (code ${event.code})`);
    if (intentionallyClosed) return;
    if (event.code === 4001) {
      log('WS_DET', 'auth rejected (4001) — not retrying');
      return;
    }
    _scheduleRetry();
  };

  ws.onerror = () => {
    log('WS_DET', 'error');
    ws?.close();
  };
}

function _scheduleRetry() {
  if (retryCount >= RETRY_DELAYS.length) return;
  const delay = RETRY_DELAYS[retryCount++];
  log('WS_DET', `retry in ${delay}ms (attempt ${retryCount})`);
  retryTimer = setTimeout(_connect, delay);
}
