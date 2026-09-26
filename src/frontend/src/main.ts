import './styles/tokens.css';
import './styles/reset.css';
import './styles/main.css';
import { initRouter } from './router';

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failure is non-fatal
    });
  });
}

initRouter();
