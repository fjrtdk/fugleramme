// ── In-memory ring-buffer logger ──────────────────────────────
// Max 200 entries. Safe to import from any module — no circular deps.

export interface LogEntry {
  ts: string;   // HH:MM:SS (local time)
  tag: string;  // source label e.g. AUTH, WS_AUDIO, MIC, ROUTER, ERROR
  msg: string;
}

const MAX_ENTRIES = 200;
const _buffer: LogEntry[] = [];

function _ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

export function log(tag: string, msg: string): void {
  if (_buffer.length >= MAX_ENTRIES) {
    _buffer.shift();
  }
  _buffer.push({ ts: _ts(), tag, msg });
}

/** Clear all buffered entries. */
export function clearEntries(): void {
  _buffer.length = 0;
}

/** All buffered entries, oldest first. */
export function getEntries(): readonly LogEntry[] {
  return _buffer;
}

/** Last `n` entries, oldest first within the tail. */
export function getTail(n = 50): readonly LogEntry[] {
  return _buffer.slice(-n);
}

// Capture unhandled promise rejections in the log buffer.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    log('ERROR', `Unhandled rejection: ${reason}`);
  });
}
