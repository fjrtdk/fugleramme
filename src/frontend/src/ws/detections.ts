import type { Detection, Settings } from '../types';
import { state } from '../state';

type DetectionHandler = (detections: Detection[]) => void;
type SettingsHandler = (settings: Settings) => void;

let ws: WebSocket | null = null;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

let onDetection: DetectionHandler | null = null;
let onSettingsChanged: SettingsHandler | null = null;
let intentionallyClosed = false;

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

  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => { retryCount = 0; };

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
    if (intentionallyClosed) return;
    if (event.code === 4001) return; // auth failure, don't retry
    _scheduleRetry();
  };

  ws.onerror = () => { ws?.close(); };
}

function _scheduleRetry() {
  if (retryCount >= RETRY_DELAYS.length) return;
  const delay = RETRY_DELAYS[retryCount++];
  retryTimer = setTimeout(_connect, delay);
}
