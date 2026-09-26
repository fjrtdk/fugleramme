import { supabase } from '../lib/supabase';
import { state } from '../state';

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
    </div>
  `;

  void initAll(container);
}

async function initAll(container: HTMLElement): Promise<void> {
  renderBrowserSection(container);
  await renderMicSection(container);
  await renderSupabaseSection(container);
  renderWsSection(container);
  bindActions(container);
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

// ── Actions ───────────────────────────────────────────────────

function bindActions(container: HTMLElement): void {
  bindMicTest(container);
  bindWsTest(container);
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
