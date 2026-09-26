import type { Detection, Settings } from '../types';
import { NEWEST_ARRIVAL_TIMEOUT_MS } from '../types';

let canvas: HTMLElement | null = null;
let emptyPerch: HTMLElement | null = null;
let currentEl: HTMLElement | null = null;
let queue: Detection[] = [];
let seenInSession = new Set<string>(); // species shown as newest arrival this session
let seenInWindow = new Map<string, number>(); // sciName → first detection timestamp in current window
let countdownTimer: ReturnType<typeof setTimeout> | null = null;
let isShowing = false;
let onFallback: (() => void) | null = null;
const timeoutMs = NEWEST_ARRIVAL_TIMEOUT_MS;

export function mountNewestArrival(
  canvasEl: HTMLElement,
  perchEl: HTMLElement,
  fallback: () => void
) {
  canvas = canvasEl;
  emptyPerch = perchEl;
  onFallback = fallback;
  seenInWindow.clear();
  queue = [];
  isShowing = false;
  updateEmptyState();
}

export function unmountNewestArrival() {
  if (countdownTimer) clearTimeout(countdownTimer);
  currentEl?.remove();
  currentEl = null;
  queue = [];
  canvas = null;
  emptyPerch = null;
  onFallback = null;
}

export function handleDetection(detections: Detection[], settings: Settings) {
  const windowMs = lookbackWindowMs(settings.lookback_window);
  const now = Date.now();

  // Clean expired from seen window
  for (const [sci, ts] of seenInWindow) {
    if (windowMs !== null && now - ts > windowMs) seenInWindow.delete(sci);
  }

  for (const det of detections) {
    const sciName = det.scientific_name ?? det.species_scientific ?? '';
    if (!sciName) continue;

    const isInWindow = seenInWindow.has(sciName);
    const shownThisSession = seenInSession.has(sciName);

    if (!isInWindow && !shownThisSession) {
      // Novel arrival
      queue.push(det);
      seenInSession.add(sciName);
    }

    if (!isInWindow) seenInWindow.set(sciName, now);
  }

  if (!isShowing && queue.length > 0) showNext();
  updateEmptyState();
}

function showNext() {
  if (!queue.length || !canvas) { isShowing = false; updateEmptyState(); return; }

  isShowing = true;
  const det = queue.shift()!;

  if (currentEl) {
    const old = currentEl;
    old.classList.add('exiting');
    setTimeout(() => old.remove(), 1100);
  }

  currentEl = createBirdEl(det);
  canvas.appendChild(currentEl);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    currentEl?.classList.remove('entering');
    currentEl?.classList.add('visible');
  }));

  updateEmptyState();

  countdownTimer = setTimeout(() => {
    if (queue.length > 0) {
      showNext();
    } else {
      // Fall back
      isShowing = false;
      if (currentEl) {
        const old = currentEl;
        old.classList.add('exiting');
        setTimeout(() => old.remove(), 1100);
        currentEl = null;
      }
      onFallback?.();
    }
  }, timeoutMs);
}

function createBirdEl(det: Detection): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bird-card bird-single bird-arrival entering';
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  if (det.illustration_path) {
    img.src = det.illustration_path;
  } else {
    el.classList.add('no-illustration');
    img.src = '/icons/silhouette.svg';
  }
  img.onerror = () => el.classList.add('no-illustration');
  el.appendChild(img);
  return el;
}

function updateEmptyState() {
  if (!emptyPerch) return;
  emptyPerch.classList.toggle('visible', !currentEl && queue.length === 0);
}

function lookbackWindowMs(w: string): number | null {
  switch (w) {
    case '15m': return 15 * 60 * 1000;
    case '1h':  return 60 * 60 * 1000;
    case '6h':  return 6 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case 'all': return null;
    default:    return 24 * 60 * 60 * 1000;
  }
}
