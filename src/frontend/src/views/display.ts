import { startAudio, stopAudio, setStatusHandler, requestMicPermission, type MicStatus } from '../ws/audio';
import { connectDetections, disconnectDetections } from '../ws/detections';
import { mountCollage, unmountCollage, handleDetection as collageDetect, refreshSettings as collageRefresh } from '../display/collage';
import { mountLatestBird, unmountLatestBird, handleDetection as latestDetect } from '../display/latest-bird';
import { mountNewestArrival, unmountNewestArrival, handleDetection as newestDetect } from '../display/newest-arrival';
import { state } from '../state';
import type { Detection, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const TRIPLE_TAP_WINDOW_MS = 1500;
const TRIPLE_TAP_COUNT = 3;

interface DisplayContainer extends HTMLElement {
  _displayCleanup?: () => void;
}

export function renderDisplay(container: HTMLElement, onTripleTap: () => void) {
  container.innerHTML = `
    <div class="display-page" id="display-inner">
      <div class="display-canvas" id="display-canvas">
        <div class="empty-perch" id="empty-perch">
          <img src="/icons/perch.svg" alt="" draggable="false" />
        </div>
      </div>
      <div class="mic-status" id="mic-status">
        <span class="mic-dot idle" id="mic-dot"></span>
        <span class="mic-status-label" id="mic-label">Initialising\u2026</span>
      </div>
      <button class="mic-retry hidden" id="mic-retry">Enable microphone</button>
    </div>
  `;

  const canvas = container.querySelector<HTMLElement>('#display-canvas')!;
  const emptyPerch = container.querySelector<HTMLElement>('#empty-perch')!;
  const micDot = container.querySelector<HTMLElement>('#mic-dot')!;
  const micLabel = container.querySelector<HTMLElement>('#mic-label')!;
  const micRetry = container.querySelector<HTMLButtonElement>('#mic-retry')!;

  let currentMode: Settings['display_mode'] | null = null;

  function getCurrentSettings(): Settings {
    return state.getSettings() ?? DEFAULT_SETTINGS;
  }

  function mountMode(mode: Settings['display_mode']) {
    if (currentMode === mode) return;

    // Unmount old mode
    if (currentMode === 'collage') unmountCollage();
    else if (currentMode === 'latest_bird') unmountLatestBird();
    else if (currentMode === 'newest_arrival') unmountNewestArrival();

    currentMode = mode;

    if (mode === 'collage') mountCollage(canvas, emptyPerch);
    else if (mode === 'latest_bird') mountLatestBird(canvas, emptyPerch);
    else if (mode === 'newest_arrival') {
      mountNewestArrival(canvas, emptyPerch, () => {
        // Fall back to collage
        mountMode('collage');
      });
    }
  }

  // Initial mode
  const settings = getCurrentSettings();
  mountMode(settings.display_mode);
  applyMarginToCanvas(canvas, settings.margin_percent);

  // Mic status
  setStatusHandler((status: MicStatus) => {
    micDot.className = `mic-dot ${status}`;
    micLabel.textContent = micStatusLabel(status);
    micRetry.classList.toggle('hidden', status !== 'denied');
  });

  micRetry.addEventListener('click', () => { requestMicPermission(); });

  // Connect detections WebSocket
  connectDetections(
    (detections: Detection[]) => {
      const s = getCurrentSettings();
      if (currentMode === 'collage') collageDetect(detections);
      else if (currentMode === 'latest_bird') latestDetect(detections);
      else if (currentMode === 'newest_arrival') newestDetect(detections, s);
    },
    (newSettings: Settings) => {
      state.setSettings(newSettings);
      // Switch mode if needed
      if (newSettings.display_mode !== currentMode) {
        mountMode(newSettings.display_mode);
      }
      applyMarginToCanvas(canvas, newSettings.margin_percent);
      if (currentMode === 'collage') collageRefresh();
    }
  );

  // Start audio
  startAudio();

  // Triple-tap detection
  let tapCount = 0;
  let tapResetTimer: ReturnType<typeof setTimeout> | null = null;

  function handleTap(event: Event) {
    // Ignore taps on mic-status and mic-retry
    if ((event.target as HTMLElement).closest('.mic-status, .mic-retry')) return;

    tapCount++;
    spawnRipple(event);

    if (tapResetTimer) clearTimeout(tapResetTimer);

    if (tapCount >= TRIPLE_TAP_COUNT) {
      tapCount = 0;
      onTripleTap();
      return;
    }

    tapResetTimer = setTimeout(() => { tapCount = 0; }, TRIPLE_TAP_WINDOW_MS);
  }

  container.addEventListener('click', handleTap);
  container.addEventListener('touchend', (e) => {
    e.preventDefault();
    handleTap(e);
  }, { passive: false });

  // Cleanup function stored on element
  (container as DisplayContainer)._displayCleanup = () => {
    stopAudio();
    disconnectDetections();
    if (currentMode === 'collage') unmountCollage();
    else if (currentMode === 'latest_bird') unmountLatestBird();
    else if (currentMode === 'newest_arrival') unmountNewestArrival();
  };
}

export function cleanupDisplay(container: HTMLElement) {
  const el = container as DisplayContainer;
  el._displayCleanup?.();
}

function applyMarginToCanvas(canvas: HTMLElement, marginPercent: number) {
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  const marginPx = shortSide * (marginPercent / 100);
  canvas.style.setProperty('--canvas-margin', `${marginPx}px`);
}

function micStatusLabel(status: MicStatus): string {
  switch (status) {
    case 'idle': return 'Idle';
    case 'requesting': return 'Requesting mic\u2026';
    case 'recording': return 'Recording';
    case 'muted': return 'Muted';
    case 'denied': return 'Microphone access denied';
    case 'error': return 'Mic error';
    default: return '';
  }
}

function spawnRipple(event: Event) {
  const displayPage = document.querySelector<HTMLElement>('.display-page');
  if (!displayPage) return;

  const ripple = document.createElement('div');
  ripple.className = 'tap-ripple';

  let x: number, y: number;
  if (event instanceof MouseEvent) {
    const rect = displayPage.getBoundingClientRect();
    x = event.clientX - rect.left;
    y = event.clientY - rect.top;
  } else {
    const rect = displayPage.getBoundingClientRect();
    x = rect.width / 2;
    y = rect.height / 2;
  }

  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  displayPage.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}
