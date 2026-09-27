import type { Detection, Settings } from '../types';
import { state } from '../state';
import { DEFAULT_SETTINGS } from '../types';
import { resolveArtworkPathSync } from '../lib/artwork';
import { log } from '../lib/logger';

let canvas: HTMLElement | null = null;
let emptyPerch: HTMLElement | null = null;
let currentEl: HTMLElement | null = null;
let seenInSession = new Set<string>(); // species shown as newest arrival this session
let seenInWindow = new Map<string, number>(); // sciName → detection timestamp in current window

export function mountNewestArrival(
  canvasEl: HTMLElement,
  perchEl: HTMLElement
) {
  canvas = canvasEl;
  emptyPerch = perchEl;
  seenInWindow.clear();
  seenInSession.clear();

  const settings = state.getSettings() ?? DEFAULT_SETTINGS;
  seedSeenInWindow(settings);

  // Show the most recent historical detection as the starting arrival.
  const latest = mostRecentDetection(state.getDetections());
  if (latest) {
    const sciName = scientificName(latest);
    if (sciName) {
      showBird(latest, sciName);
      seenInSession.add(sciName);
    }
  }

  updateEmptyState();
}

export function unmountNewestArrival() {
  currentEl?.remove();
  currentEl = null;
  canvas = null;
  emptyPerch = null;
  seenInWindow.clear();
  seenInSession.clear();
}

export function handleDetection(detections: Detection[], settings: Settings) {
  const now = Date.now();
  const windowMs = lookbackWindowMs(settings.lookback_window);

  // Clean expired entries from the novelty window.
  if (windowMs !== null) {
    for (const [sci, ts] of seenInWindow) {
      if (now - ts > windowMs) seenInWindow.delete(sci);
    }
  }

  // Identify the newest novel species among the freshly received detections.
  // A species is novel if it was not already in the lookback window and has
  // not been shown as the newest arrival this session.
  let newestNovel: Detection | null = null;
  for (const det of detections) {
    const sciName = scientificName(det);
    if (!sciName) continue;

    const alreadySeenInWindow = seenInWindow.has(sciName);
    const alreadyShown = seenInSession.has(sciName);

    if (!alreadySeenInWindow && !alreadyShown) {
      if (!newestNovel || detectionTimestamp(det) > detectionTimestamp(newestNovel)) {
        newestNovel = det;
      }
    }

    // Update the window with this detection.
    seenInWindow.set(sciName, now);
  }

  if (newestNovel) {
    const sciName = scientificName(newestNovel);
    if (sciName) {
      showBird(newestNovel, sciName);
      seenInSession.add(sciName);
    }
  }

  updateEmptyState();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedSeenInWindow(settings: Settings) {
  const now = Date.now();
  const windowMs = lookbackWindowMs(settings.lookback_window);
  for (const d of state.getDetections()) {
    const sci = scientificName(d);
    if (!sci) continue;
    const ts = detectionTimestamp(d);
    if (windowMs === null || now - ts <= windowMs) {
      // Keep the oldest timestamp in the window; any recent detection keeps it
      // marked as seen.
      const existing = seenInWindow.get(sci);
      if (existing === undefined || ts < existing) {
        seenInWindow.set(sci, ts);
      }
    }
  }
}

function mostRecentDetection(detections: Detection[]): Detection | null {
  let best: Detection | null = null;
  let bestTs = -Infinity;
  for (const d of detections) {
    const ts = detectionTimestamp(d);
    if (ts > bestTs) {
      bestTs = ts;
      best = d;
    }
  }
  return best;
}

function scientificName(d: Detection): string {
  return d.scientific_name ?? d.species_scientific ?? '';
}

function commonName(d: Detection): string {
  return d.common_name ?? d.species_common ?? '';
}

function detectionTimestamp(d: Detection): number {
  const raw = d.detected_at ?? d.timestamp;
  if (!raw) return 0;
  const n = new Date(raw).getTime();
  return isNaN(n) ? 0 : n;
}

function lookbackWindowMs(w: Settings['lookback_window']): number | null {
  switch (w) {
    case '15m': return 15 * 60 * 1000;
    case '1h':  return 60 * 60 * 1000;
    case '6h':  return 6 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case 'all': return null;
    default:    return 24 * 60 * 60 * 1000;
  }
}

function showBird(det: Detection, sciName: string) {
  if (!canvas) return;

  if (currentEl) {
    const old = currentEl;
    old.classList.add('exiting');
    setTimeout(() => old.remove(), 1100);
  }

  currentEl = createBirdEl(det, sciName);
  canvas.appendChild(currentEl);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    currentEl?.classList.remove('entering');
    currentEl?.classList.add('visible');
  }));

  updateEmptyState();
  log('DISPLAY', 'Rendered 1 bird in newest_arrival mode');
}

function createBirdEl(det: Detection, sciName: string): HTMLElement {
  const settings = state.getSettings();
  const el = document.createElement('div');
  el.className = 'bird-card bird-single bird-arrival entering';

  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;

  const common = commonName(det);
  const artStyle = settings?.artwork_style ?? 'classic';
  // Always resolve client-side: server-stored paths may be stale/wrong extension.
  const illustrationPath = resolveArtworkPathSync(sciName, common, artStyle);

  if (illustrationPath) {
    img.src = illustrationPath;
  } else {
    el.classList.add('no-illustration');
    img.src = '/icons/silhouette.svg';
  }
  img.onerror = () => {
    el.classList.add('no-illustration');
    img.src = '/icons/silhouette.svg';
  };
  el.appendChild(img);

  if (settings?.show_species_label) {
    const label = document.createElement('span');
    label.className = 'bird-label';
    if (settings.font_family) {
      label.style.fontFamily = `'${settings.font_family}', Georgia, serif`;
    }
    label.textContent = settings.label_language === 'scientific' ? sciName : (common || sciName);
    el.appendChild(label);
  }

  return el;
}

function updateEmptyState() {
  if (!emptyPerch) return;
  emptyPerch.classList.toggle('visible', !currentEl);
}

export function refreshSettings() {
  // If the lookback window changed, re-seed from state and refresh the label
  // of the currently shown bird.
  const settings = state.getSettings() ?? DEFAULT_SETTINGS;
  seenInWindow.clear();
  seedSeenInWindow(settings);
  if (currentEl) {
    const label = currentEl.querySelector<HTMLElement>('.bird-label');
    if (label && settings.font_family) {
      label.style.fontFamily = `'${settings.font_family}', Georgia, serif`;
    }
  }
}

export function getRenderedBirdCount(): number {
  return currentEl ? 1 : 0;
}
