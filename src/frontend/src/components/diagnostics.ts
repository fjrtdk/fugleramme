import { supabase, supabaseUrl } from '../lib/supabase';
import { state } from '../state';
import { getTail, getEntries, clearEntries } from '../lib/logger';
import { getAudioWsState, getAudioDiagnostics } from '../ws/audio';
import { getDetectionsWsState, getWsDiagnostics, getDetectionsSnapshot } from '../ws/detections';
import { getRenderedBirdCount as getCollageCount } from '../display/collage';
import { getRenderedBirdCount as getLatestCount } from '../display/latest-bird';
import { getRenderedBirdCount as getNewestCount } from '../display/newest-arrival';

type RowStatus = 'ok' | 'warn' | 'error' | 'neutral';

interface DiagRow {
  label: string;
  value: string;
  status: RowStatus;
}

export function renderDiagnostics(container: HTMLElement): void {
  container.innerHTML = `
    <div class="diag-panel" id="diag-panel-inner">
      <div class="diag-section">
        <h3 class="diag-section-title">Browser</h3>
        <div class="diag-rows" id="diag-browser-rows">
          <div class="diag-row"><span class="diag-label">Loading…</span></div>
        </div>
      </div>
      <div class="diag-section">
        <h3 class="diag-section-title">Microphone</h3>
        <div class="diag-rows" id="diag-mic-rows">
          <div class="diag-row"><span class="diag-label">Loading…</span></div>
        </div>
        <div class="diag-action-row">
          <button class="btn-diag-test" id="diag-mic-test">Test Microphone</button>
          <span class="diag-test-result hidden" id="diag-mic-result"></span>
        </div>
      </div>
      <div class="diag-section">
        <h3 class="diag-section-title">Supabase</h3>
        <div class="diag-rows" id="diag-supabase-rows">
          <div class="diag-row"><span class="diag-label">Loading…</span></div>
        </div>
      </div>
      <div class="diag-section">
        <h3 class="diag-section-title">WebSocket</h3>
        <div class="diag-rows" id="diag-ws-rows">
          <div class="diag-row"><span class="diag-label">Loading…</span></div>
        </div>
        <div class="diag-action-row">
          <button class="btn-diag-test" id="diag-ws-test">Test Audio WS</button>
          <span class="diag-test-result hidden" id="diag-ws-result"></span>
        </div>
      </div>
      <div class="diag-section">
        <h3 class="diag-section-title">Doctor Report</h3>
        <div class="diag-action-row">
          <button class="btn-diag-test" id="diag-run-doctor">Run Doctor</button>
          <button class="btn-diag-test btn-diag-refresh hidden" id="diag-refresh-doctor">Refresh</button>
          <button class="btn-diag-test btn-diag-copy hidden" id="diag-copy-report">Copy Report</button>
          <span class="diag-test-result hidden" id="diag-doctor-status"></span>
        </div>
        <div class="diag-report-wrap hidden" id="diag-report-wrap">
          <textarea class="diag-report" id="diag-report" readonly spellcheck="false"></textarea>
        </div>
      </div>
      <div class="diag-section">
        <h3 class="diag-section-title">Recent Detections</h3>
        <div class="diag-rows" id="diag-detections-summary">
          <div class="diag-row"><span class="diag-label">Loading…</span></div>
        </div>
        <div class="diag-log-entries diag-detections-list" id="diag-detections-list">
          <div class="diag-log-empty">No detections yet.</div>
        </div>
      </div>
      <div class="diag-section diag-section--log">
        <button class="diag-log-toggle" id="diag-inference-log-toggle" type="button">
          <span>Inference Log</span>
          <span class="diag-log-count" id="diag-inference-log-count"></span>
          <span class="diag-log-chevron" id="diag-inference-log-chevron">▶</span>
        </button>
        <div class="diag-log-body hidden" id="diag-inference-log-body">
          <div class="diag-log-entries" id="diag-inference-log-entries">
            <div class="diag-log-empty">No inference attempts recorded yet.</div>
          </div>
        </div>
      </div>
      <div class="diag-section diag-section--log">
        <button class="diag-log-toggle" id="diag-log-toggle" type="button">
          <span>Debug Log</span>
          <span class="diag-log-count" id="diag-log-count"></span>
          <span class="diag-log-chevron" id="diag-log-chevron">▶</span>
        </button>
        <div class="diag-log-body hidden" id="diag-log-body">
          <div class="diag-action-row">
            <button class="btn-diag-test" id="diag-log-refresh">Refresh</button>
            <button class="btn-diag-test btn-diag-clear" id="diag-log-clear">Clear Log</button>
          </div>
          <div class="diag-log-entries" id="diag-log-entries"></div>
        </div>
      </div>
    </div>
  `;

  void initAll(container);
  startDetectionsPolling(container);
}

async function initAll(container: HTMLElement): Promise<void> {
  renderBrowserSection(container);
  await renderMicSection(container);
  await renderSupabaseSection(container);
  renderWsSection(container);
  bindActions(container);
  updateLogCount(container);
}

// ── Browser ───────────────────────────────────────────────────

function renderBrowserSection(container: HTMLElement): void {
  const rows: DiagRow[] = [
    {
      label: 'Secure context (HTTPS)',
      value: window.isSecureContext
        ? 'Yes'
        : 'No — microphone access requires HTTPS',
      status: window.isSecureContext ? 'ok' : 'error',
    },
    {
      label: 'MediaDevices API',
      value:
        typeof navigator.mediaDevices !== 'undefined'
          ? 'Available'
          : 'Not available',
      status: typeof navigator.mediaDevices !== 'undefined' ? 'ok' : 'error',
    },
    {
      label: 'User Agent',
      value: navigator.userAgent,
      status: 'neutral',
    },
  ];
  setRows(container, 'diag-browser-rows', rows);
}

// ── Microphone ────────────────────────────────────────────────

async function renderMicSection(container: HTMLElement): Promise<void> {
  const rows: DiagRow[] = [];

  if (navigator.permissions) {
    try {
      const result = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      const statusMap: Record<string, RowStatus> = {
        granted: 'ok',
        denied: 'error',
        prompt: 'warn',
      };
      rows.push({
        label: 'Permission',
        value: result.state,
        status: statusMap[result.state] ?? 'neutral',
      });
    } catch {
      rows.push({
        label: 'Permission',
        value: 'Unable to query (try the test button)',
        status: 'neutral',
      });
    }
  } else {
    rows.push({
      label: 'Permission',
      value: 'Permissions API not available',
      status: 'warn',
    });
  }

  if (navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioIn = devices.filter(d => d.kind === 'audioinput');
      rows.push({
        label: 'Audio input devices',
        value:
          audioIn.length === 0
            ? 'None found'
            : audioIn
                .map(d => d.label || `[unlabelled — ${d.deviceId.slice(0, 8)}…]`)
                .join('; '),
        status: audioIn.length > 0 ? 'ok' : 'warn',
      });
    } catch (e) {
      rows.push({
        label: 'Audio input devices',
        value: `Error: ${(e as Error).message}`,
        status: 'error',
      });
    }
  } else {
    rows.push({
      label: 'Audio input devices',
      value: 'enumerateDevices not available',
      status: 'error',
    });
  }

  setRows(container, 'diag-mic-rows', rows);
}

// ── Supabase ──────────────────────────────────────────────────

async function renderSupabaseSection(container: HTMLElement): Promise<void> {
  const rows: DiagRow[] = [];

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      rows.push({
        label: 'Status',
        value: `Error: ${error.message}`,
        status: 'error',
      });
    } else if (data.session) {
      rows.push({ label: 'Status', value: 'Authenticated', status: 'ok' });
      rows.push({
        label: 'User',
        value: data.session.user.email ?? data.session.user.id,
        status: 'ok',
      });
      const expiresAt = data.session.expires_at;
      if (expiresAt) {
        const expiresDate = new Date(expiresAt * 1000);
        const inMins = Math.round(
          (expiresDate.getTime() - Date.now()) / 60_000
        );
        rows.push({
          label: 'Token expires',
          value: `${expiresDate.toLocaleTimeString()} (in ~${inMins} min)`,
          status: inMins > 5 ? 'ok' : 'warn',
        });
      }
    } else {
      rows.push({
        label: 'Status',
        value: 'No active session',
        status: 'warn',
      });
    }
  } catch (e) {
    rows.push({
      label: 'Status',
      value: `Exception: ${(e as Error).message}`,
      status: 'error',
    });
  }

  const stateToken = state.getToken();
  rows.push({
    label: 'App auth token',
    value: stateToken ? `Present (${stateToken.slice(0, 12)}…)` : 'Missing',
    status: stateToken ? 'ok' : 'error',
  });

  setRows(container, 'diag-supabase-rows', rows);
}

// ── WebSocket ─────────────────────────────────────────────────

function renderWsSection(container: HTMLElement): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${protocol}//${location.host}`;
  const token = state.getToken();

  const rows: DiagRow[] = [
    {
      label: 'Audio WS',
      value: `${base}/ws/audio`,
      status: 'neutral',
    },
    {
      label: 'Detections WS',
      value: `${base}/ws/detections`,
      status: 'neutral',
    },
    {
      label: 'Auth token for WS',
      value: token ? 'Present' : 'Missing — WebSocket will fail with 4001',
      status: token ? 'ok' : 'error',
    },
  ];

  setRows(container, 'diag-ws-rows', rows);
}

// ── Recent Detections / Inference Log ───────────────────────────

let _detectionsPollTimer: ReturnType<typeof setInterval> | null = null;
let _lastRenderedInferenceCount = -1;

function startDetectionsPolling(container: HTMLElement): void {
  if (_detectionsPollTimer) clearInterval(_detectionsPollTimer);
  renderDetectionsSection(container);
  renderInferenceLogEntries(container);
  _detectionsPollTimer = setInterval(() => {
    if (!container.isConnected) {
      if (_detectionsPollTimer) clearInterval(_detectionsPollTimer);
      _detectionsPollTimer = null;
      return;
    }
    const snap = getDetectionsSnapshot();
    if (snap.inferenceLog.length !== _lastRenderedInferenceCount) {
      renderDetectionsSection(container);
      renderInferenceLogEntries(container);
    }
  }, 1000);
}

function renderDetectionsSection(container: HTMLElement): void {
  const snap = getDetectionsSnapshot();
  _lastRenderedInferenceCount = snap.inferenceLog.length;

  const running = snap.lastInferenceTime !== null && Date.now() - snap.lastInferenceTime < 10_000;
  const rows: DiagRow[] = [
    {
      label: 'Last inference',
      value: snap.lastInferenceTime === null ? 'never' : new Date(snap.lastInferenceTime).toLocaleTimeString(),
      status: snap.lastInferenceTime === null ? 'neutral' : 'ok',
    },
    {
      label: 'Last detection count',
      value: String(snap.lastDetectionCount),
      status: snap.lastDetectionCount > 0 ? 'ok' : 'neutral',
    },
    {
      label: 'Status',
      value: snap.lastInferenceTime === null
        ? 'No inference received yet'
        : running
          ? (snap.lastDetectionCount > 0 ? 'Inference running' : 'Inference silent')
          : 'Inference silent',
      status: snap.lastInferenceTime === null
        ? 'neutral'
        : (running && snap.lastDetectionCount > 0 ? 'ok' : 'warn'),
    },
  ];
  setRows(container, 'diag-detections-summary', rows);

  const listEl = container.querySelector<HTMLElement>('#diag-detections-list');
  if (!listEl) return;
  if (snap.recentDetections.length === 0) {
    listEl.innerHTML = '<div class="diag-log-empty">No detections yet.</div>';
    return;
  }
  listEl.innerHTML = [...snap.recentDetections].reverse().map(d => {
    const common = d.common_name ?? d.species_common ?? '?';
    const scientific = d.scientific_name ?? d.species_scientific ?? '?';
    const ts = new Date(d.receivedAt).toLocaleTimeString();
    return `<div class="diag-log-entry">` +
      `<span class="diag-log-ts">${escapeHtml(ts)}</span>` +
      `<span class="diag-log-tag">${escapeHtml(common)} (${escapeHtml(scientific)})</span>` +
      `<span class="diag-log-msg">confidence ${d.confidence.toFixed(2)}</span>` +
      `</div>`;
  }).join('');
}

function renderInferenceLogEntries(container: HTMLElement): void {
  const el = container.querySelector<HTMLElement>('#diag-inference-log-entries');
  const countEl = container.querySelector<HTMLElement>('#diag-inference-log-count');
  const snap = getDetectionsSnapshot();

  if (countEl) countEl.textContent = snap.inferenceLog.length > 0 ? `(${snap.inferenceLog.length})` : '';

  if (!el) return;
  if (snap.inferenceLog.length === 0) {
    el.innerHTML = '<div class="diag-log-empty">No inference attempts recorded yet.</div>';
    return;
  }
  el.innerHTML = [...snap.inferenceLog].reverse().map(e => {
    const summary = e.detectionCount === 0
      ? 'no detections'
      : e.raw.map(d => `${d.common_name ?? d.species_common ?? '?'} ${d.confidence.toFixed(2)}`).join(', ');
    return `<div class="diag-log-entry">` +
      `<span class="diag-log-ts">${escapeHtml(new Date(e.ts).toLocaleTimeString())}</span>` +
      `<span class="diag-log-tag">${e.detectionCount} detection(s)</span>` +
      `<span class="diag-log-msg">${escapeHtml(summary)}</span>` +
      `</div>`;
  }).join('');
}

// ── Doctor Report ─────────────────────────────────────────────

function getTotalRenderedBirds(): number {
  return getCollageCount() + getLatestCount() + getNewestCount();
}

function formatIso(ts: number | null): string {
  if (ts === null) return 'never';
  return new Date(ts).toISOString();
}

function withLineNumbers(lines: string[]): string[] {
  const width = String(lines.length).length;
  return lines.map((line, i) => `${String(i + 1).padStart(width, '0')}: ${line}`);
}

async function buildDoctorReport(): Promise<string> {
  const lines: string[] = [];
  const wsStateLabels: Record<number, string> = {
    [WebSocket.CONNECTING]: 'connecting',
    [WebSocket.OPEN]: 'connected',
    [WebSocket.CLOSING]: 'closing',
    [WebSocket.CLOSED]: 'closed',
  };

  lines.push('=== Fugleramme Doctor ===');
  lines.push(`Timestamp: ${new Date().toISOString()}`);
  lines.push(`Browser: ${navigator.userAgent}`);
  lines.push(`Secure Context: ${window.isSecureContext ? 'Yes' : 'No'}`);
  lines.push(`MediaDevices API: ${typeof navigator.mediaDevices !== 'undefined' ? 'Yes' : 'No'}`);

  // Network
  lines.push('');
  lines.push('=== Network ===');
  lines.push(`Origin: ${window.location.origin}`);
  lines.push(`Hostname: ${window.location.hostname}`);
  lines.push(`HTTPS: ${window.location.protocol === 'https:' ? 'Yes' : 'No'}`);
  lines.push(`Audio WS URL: ${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/audio`);
  lines.push(`Detections WS URL: ${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/detections`);

  // Display
  const settings = state.getSettings();
  lines.push('');
  lines.push('=== Display ===');
  lines.push(`Display mode: ${settings?.display_mode ?? 'not loaded'}`);
  lines.push(`Viewport: ${window.innerWidth}x${window.innerHeight}`);
  lines.push(`Rendered birds: ${getTotalRenderedBirds()}`);
  lines.push(`Font family: ${settings?.font_family ?? 'default'}`);
  lines.push(`Artwork style: ${settings?.artwork_style ?? 'default'}`);

  // Audio Pipeline
  const audioDiag = getAudioDiagnostics();
  lines.push('');
  lines.push('=== Audio Pipeline ===');
  lines.push(`Sample rate: ${audioDiag.sampleRate ?? 'N/A'} Hz`);
  lines.push(`AudioContext state: ${audioDiag.state}`);
  lines.push(`ScriptProcessor buffer size: ${audioDiag.bufferSize}`);
  lines.push(`Frame samples: ${audioDiag.frameSamples}`);
  lines.push(`Microphone active: ${audioDiag.mediaStreamActive ? 'Yes' : 'No'}`);
  lines.push(`Microphone tracks: ${audioDiag.mediaStreamTrackCount}`);

  // Settings
  lines.push('');
  lines.push('=== Settings ===');
  if (settings) {
    lines.push(`display_mode: ${settings.display_mode}`);
    lines.push(`margin_percent: ${settings.margin_percent}`);
    lines.push(`lookback_window: ${settings.lookback_window}`);
    lines.push(`max_species: ${settings.max_species ?? 'null'}`);
    lines.push(`species_sort: ${settings.species_sort}`);
    lines.push(`latitude: ${settings.latitude ?? 'null'}`);
    lines.push(`longitude: ${settings.longitude ?? 'null'}`);
    lines.push(`font_family: ${settings.font_family}`);
    lines.push(`artwork_style: ${settings.artwork_style}`);
    lines.push(`show_species_label: ${settings.show_species_label}`);
    lines.push(`label_language: ${settings.label_language}`);
    lines.push(`confidence_threshold: ${settings.confidence_threshold ?? 'not configured'}`);
  } else {
    lines.push('Settings not loaded');
  }

  // Supabase Details
  lines.push('');
  lines.push('=== Supabase Details ===');
  lines.push(`URL: ${supabaseUrl}`);
  const source = import.meta.env.VITE_SUPABASE_URL ? 'injected' : 'same-origin proxy';
  lines.push(`Configuration source: ${source}`);
  try {
    const url = new URL(supabaseUrl);
    const refMatch = url.hostname.match(/^([^.]+)\.supabase\.co$/);
    lines.push(`Project ref: ${refMatch ? refMatch[1] : 'N/A'}`);
  } catch {
    lines.push('Project ref: N/A');
  }

  // WebSocket Details
  const audioWsState = getAudioWsState();
  const detWsState = getDetectionsWsState();
  const audioWsDiag = getAudioDiagnostics();
  const detWsDiag = getWsDiagnostics();
  lines.push('');
  lines.push('=== WebSocket Details ===');
  lines.push(`Audio WS state: ${wsStateLabels[audioWsState] ?? 'unknown'}`);
  lines.push(`Detections WS state: ${wsStateLabels[detWsState] ?? 'unknown'}`);
  lines.push(`Audio WS last attempt: ${formatIso(audioWsDiag.lastConnectionAttemptTime)}`);
  lines.push(`Audio WS last close code: ${audioWsDiag.lastCloseCode ?? 'N/A'}`);
  lines.push(`Audio WS last close reason: ${audioWsDiag.lastCloseReason ?? 'N/A'}`);
  lines.push(`Audio WS reconnections: ${audioWsDiag.retryCount}`);
  lines.push(`Detections WS last attempt: ${formatIso(detWsDiag.lastConnectionAttemptTime)}`);
  lines.push(`Detections WS last close code: ${detWsDiag.lastCloseCode ?? 'N/A'}`);
  lines.push(`Detections WS last close reason: ${detWsDiag.lastCloseReason ?? 'N/A'}`);
  lines.push(`Detections WS reconnections: ${detWsDiag.retryCount}`);
  lines.push('Latency/ping: not measured');

  // Mic permission
  let micPermission = 'unknown';
  if (navigator.permissions) {
    try {
      const r = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      micPermission = r.state;
    } catch {
      micPermission = 'query failed';
    }
  } else {
    micPermission = 'Permissions API not available';
  }
  lines.push('');
  lines.push('=== Microphone ===');
  lines.push(`Permission: ${micPermission}`);

  // Mic test (only if permission already granted — don't prompt)
  if (micPermission === 'granted') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const label = stream.getAudioTracks()[0]?.label || 'unknown device';
      stream.getTracks().forEach(t => t.stop());
      lines.push(`Mic Test: OK (device: "${label}")`);
    } catch (e) {
      lines.push(`Mic Test: Error — ${(e as Error).message}`);
    }
  } else {
    lines.push(`Mic Test: skipped (permission: ${micPermission})`);
  }

  // Audio devices
  if (navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioIn = devices.filter(d => d.kind === 'audioinput');
      lines.push(`Audio Devices: ${audioIn.length} found`);
      audioIn.forEach((d, i) => {
        const label = d.label || `[unlabelled — ${d.deviceId.slice(0, 8)}…]`;
        lines.push(`  - ${label}${i === 0 ? ' (default)' : ''}`);
      });
    } catch (e) {
      lines.push(`Audio Devices: Error — ${(e as Error).message}`);
    }
  }

  // Supabase
  lines.push('');
  lines.push('=== Supabase Auth ===');
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      lines.push(`Status: Error — ${error.message}`);
    } else if (data.session) {
      const identity = data.session.user.email ?? data.session.user.id;
      lines.push(`Status: Authenticated (${identity})`);
      const expiresAt = data.session.expires_at;
      if (expiresAt) {
        lines.push(`Token Expiry: ${new Date(expiresAt * 1000).toISOString()}`);
      }
    } else {
      lines.push('Status: No active session');
    }
  } catch (e) {
    lines.push(`Status: Exception — ${(e as Error).message}`);
  }

  // WebSocket live state
  lines.push('');
  lines.push('=== WebSocket Live State ===');
  lines.push(`Audio WS: ${audioWsState === WebSocket.OPEN ? 'OK' : 'Not open'} (${wsStateLabels[audioWsState] ?? 'unknown'})`);
  lines.push(`Detections WS: ${detWsState === WebSocket.OPEN ? 'OK' : 'Not open'} (${wsStateLabels[detWsState] ?? 'unknown'})`);

  // Errors
  lines.push('');
  lines.push('=== Errors (last 10) ===');
  const errors = getEntries().filter(e => e.tag === 'ERROR').slice(-10);
  if (errors.length === 0) {
    lines.push('(no errors logged)');
  } else {
    errors.forEach(e => {
      lines.push(`[${e.ts}] ${e.msg}`);
    });
  }

  // Debug log tail
  lines.push('');
  lines.push('=== Debug Log (last 50 entries) ===');
  const tail = getTail(50);
  if (tail.length === 0) {
    lines.push('(no entries yet)');
  } else {
    tail.forEach(e => {
      lines.push(`[${e.ts}] ${e.tag}: ${e.msg}`);
    });
  }
  lines.push('=== End Report ===');

  return withLineNumbers(lines).join('\n');
}

// ── Actions ───────────────────────────────────────────────────

function bindActions(container: HTMLElement): void {
  bindMicTest(container);
  bindWsTest(container);
  bindDoctor(container);
  bindLogSection(container);
  bindInferenceLogSection(container);
}

function bindMicTest(container: HTMLElement): void {
  const btn = container.querySelector<HTMLButtonElement>('#diag-mic-test');
  const result = container.querySelector<HTMLElement>('#diag-mic-result');
  if (!btn || !result) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Testing…';
    result.className = 'diag-test-result hidden';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const tracks = stream.getAudioTracks();
      const label = tracks[0]?.label || 'unknown device';
      stream.getTracks().forEach(t => t.stop());
      result.textContent = `Success — ${label}`;
      result.className = 'diag-test-result ok';
      // Refresh permission row now that user has granted (or denied) access
      await renderMicSection(container);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      result.textContent = `${err.name ?? 'Error'}: ${err.message ?? 'unknown'}`;
      result.className = 'diag-test-result error';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Test Microphone';
    }
  });
}

function bindWsTest(container: HTMLElement): void {
  const btn = container.querySelector<HTMLButtonElement>('#diag-ws-test');
  const result = container.querySelector<HTMLElement>('#diag-ws-result');
  if (!btn || !result) return;

  btn.addEventListener('click', () => {
    const token = state.getToken();
    if (!token) {
      result.textContent = 'No auth token — cannot test';
      result.className = 'diag-test-result error';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Connecting…';
    result.className = 'diag-test-result hidden';

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws/audio?token=${encodeURIComponent(token)}`;
    let settled = false;

    const finish = (text: string, cls: RowStatus | 'warn') => {
      if (settled) return;
      settled = true;
      result.textContent = text;
      result.className = `diag-test-result ${cls}`;
      btn.disabled = false;
      btn.textContent = 'Test Audio WS';
    };

    try {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        finish('Timeout — server did not respond in 5 s', 'warn');
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timer);
        ws.close(1000);
        finish('Connected successfully', 'ok');
      };
      ws.onerror = () => {
        clearTimeout(timer);
        ws.close();
        finish('Connection error', 'error');
      };
      ws.onclose = event => {
        clearTimeout(timer);
        if (event.code === 4001) {
          finish('Auth rejected (code 4001) — token may be expired', 'error');
        } else if (!settled) {
          finish(`Closed with code ${event.code}`, 'warn');
        }
      };
    } catch (e) {
      finish(`Exception: ${(e as Error).message}`, 'error');
    }
  });
}

function bindDoctor(container: HTMLElement): void {
  const runBtn = container.querySelector<HTMLButtonElement>('#diag-run-doctor');
  const refreshBtn = container.querySelector<HTMLButtonElement>('#diag-refresh-doctor');
  const copyBtn = container.querySelector<HTMLButtonElement>('#diag-copy-report');
  const statusEl = container.querySelector<HTMLElement>('#diag-doctor-status');
  const reportWrap = container.querySelector<HTMLElement>('#diag-report-wrap');
  const reportEl = container.querySelector<HTMLTextAreaElement>('#diag-report');
  if (!runBtn || !refreshBtn || !copyBtn || !statusEl || !reportWrap || !reportEl) return;

  const generate = async () => {
    runBtn.disabled = true;
    refreshBtn.disabled = true;
    statusEl.className = 'diag-test-result hidden';

    try {
      const report = await buildDoctorReport();
      reportEl.value = report;
      reportWrap.classList.remove('hidden');
      copyBtn.classList.remove('hidden');
      refreshBtn.classList.remove('hidden');
      statusEl.textContent = 'Report ready';
      statusEl.className = 'diag-test-result ok';
      // Also refresh the log display
      renderLogEntries(container);
      updateLogCount(container);
    } catch (e) {
      statusEl.textContent = `Error: ${(e as Error).message}`;
      statusEl.className = 'diag-test-result error';
    } finally {
      runBtn.disabled = false;
      refreshBtn.disabled = false;
      runBtn.textContent = 'Run Doctor';
    }
  };

  runBtn.addEventListener('click', generate);
  refreshBtn.addEventListener('click', generate);

  copyBtn.addEventListener('click', async () => {
    const text = reportEl.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const orig = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.disabled = true;
      setTimeout(() => {
        copyBtn.textContent = orig;
        copyBtn.disabled = false;
      }, 1500);
    } catch {
      // Fallback: select all text so user can copy manually
      reportEl.select();
    }
  });
}

function bindLogSection(container: HTMLElement): void {
  const toggle = container.querySelector<HTMLButtonElement>('#diag-log-toggle');
  const body = container.querySelector<HTMLElement>('#diag-log-body');
  const chevron = container.querySelector<HTMLElement>('#diag-log-chevron');
  const refreshBtn = container.querySelector<HTMLButtonElement>('#diag-log-refresh');
  const clearBtn = container.querySelector<HTMLButtonElement>('#diag-log-clear');
  if (!toggle || !body || !chevron) return;

  toggle.addEventListener('click', () => {
    const isOpen = !body.classList.contains('hidden');
    if (isOpen) {
      body.classList.add('hidden');
      chevron.textContent = '▶';
      toggle.classList.remove('active');
    } else {
      body.classList.remove('hidden');
      chevron.textContent = '▼';
      toggle.classList.add('active');
      renderLogEntries(container);
      updateLogCount(container);
    }
  });

  refreshBtn?.addEventListener('click', () => {
    renderLogEntries(container);
    updateLogCount(container);
  });

  clearBtn?.addEventListener('click', () => {
    clearEntries();
    renderLogEntries(container);
    updateLogCount(container);
  });
}

function renderLogEntries(container: HTMLElement): void {
  const el = container.querySelector<HTMLElement>('#diag-log-entries');
  if (!el) return;
  const entries = getEntries();
  if (entries.length === 0) {
    el.innerHTML = '<div class="diag-log-empty">No log entries yet.</div>';
    return;
  }
  // Show newest first
  el.innerHTML = [...entries].reverse().map(e =>
    `<div class="diag-log-entry">` +
    `<span class="diag-log-ts">${escapeHtml(e.ts)}</span>` +
    `<span class="diag-log-tag">${escapeHtml(e.tag)}</span>` +
    `<span class="diag-log-msg">${escapeHtml(e.msg)}</span>` +
    `</div>`
  ).join('');
}

function updateLogCount(container: HTMLElement): void {
  const el = container.querySelector<HTMLElement>('#diag-log-count');
  if (!el) return;
  const n = getEntries().length;
  el.textContent = n > 0 ? `(${n})` : '';
}

function bindInferenceLogSection(container: HTMLElement): void {
  const toggle = container.querySelector<HTMLButtonElement>('#diag-inference-log-toggle');
  const body = container.querySelector<HTMLElement>('#diag-inference-log-body');
  const chevron = container.querySelector<HTMLElement>('#diag-inference-log-chevron');
  if (!toggle || !body || !chevron) return;

  toggle.addEventListener('click', () => {
    const isOpen = !body.classList.contains('hidden');
    if (isOpen) {
      body.classList.add('hidden');
      chevron.textContent = '▶';
      toggle.classList.remove('active');
    } else {
      body.classList.remove('hidden');
      chevron.textContent = '▼';
      toggle.classList.add('active');
      renderInferenceLogEntries(container);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────

function setRows(
  container: HTMLElement,
  rowsId: string,
  rows: DiagRow[]
): void {
  const el = container.querySelector(`#${rowsId}`);
  if (!el) return;
  el.innerHTML = rows
    .map(
      r => `
    <div class="diag-row">
      <span class="diag-label">${escapeHtml(r.label)}</span>
      <span class="diag-value diag-value--${r.status}">${escapeHtml(r.value)}</span>
    </div>`
    )
    .join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
