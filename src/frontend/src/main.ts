import './styles/tokens.css';
import './styles/reset.css';
import './styles/main.css';
import { initRouter } from './router';
import { log } from './lib/logger';

// ── Global error capture ───────────────────────────────────────

window.onerror = (msg, src, line, col, err) => {
  const loc = src ? ` (${src}:${line ?? 0}:${col ?? 0})` : '';
  log('ERROR', `${String(msg)}${loc}${err?.stack ? ' — ' + err.stack.split('\n')[0] : ''}`);
};

window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  const reason = e.reason instanceof Error
    ? `${e.reason.name}: ${e.reason.message}`
    : String(e.reason);
  log('ERROR', `Unhandled rejection: ${reason}`);
});

// ── Service Worker ─────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failure is non-fatal
    });
  });
}

initRouter();
