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

  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    retryCount = 0;
    log('WS_DET', 'connected');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as { type: string; detections?: Detection[]; settings?: Settings };
      if (msg.type === 'detection' && onDetection && msg.detections) {
        onDetection(msg.detections);
      } else if (msg.type === 'settings_changed' && onSettingsChanged && msg.settings) {
        onSettingsChanged(msg.settings);
      }
    } catch { /* ignore malformed */ }
  };

  ws.onclose = (event) => {
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
