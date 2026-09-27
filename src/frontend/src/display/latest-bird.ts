import type { Detection } from '../types';
import { state } from '../state';
import { resolveArtworkPathSync } from '../lib/artwork';
import { log } from '../lib/logger';

let canvas: HTMLElement | null = null;
let emptyPerch: HTMLElement | null = null;
let currentSciName: string | null = null;
let currentEl: HTMLElement | null = null;

export function mountLatestBird(canvasEl: HTMLElement, perchEl: HTMLElement) {
  canvas = canvasEl;
  emptyPerch = perchEl;
  renderFromState();
  updateEmptyState();
}

export function unmountLatestBird() {
  currentEl?.remove();
  currentEl = null;
  currentSciName = null;
  canvas = null;
  emptyPerch = null;
}

export function handleDetection(_detections: Detection[]) {
  // Render from the full state store; the passed array may only contain
  // the newest detections.
  renderFromState();
}

function renderFromState() {
  const settings = state.getSettings();
  if (!settings || !canvas) return;

  const all = state.getDetections();
  if (!all.length) {
    clearCurrent();
    updateEmptyState();
    return;
  }

  const latest = mostRecentDetection(all);
  if (!latest) {
    updateEmptyState();
    return;
  }

  const sciName = scientificName(latest);
  if (!sciName) return;

  if (sciName === currentSciName) {
    // Same species is still the latest; refresh its label in case settings changed.
    updateCurrentLabel(latest, sciName);
    return;
  }

  showBird(latest, sciName);
  updateEmptyState();
  log('DISPLAY', 'Rendered 1 bird in latest_bird mode');
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

function showBird(det: Detection, sciName: string) {
  if (!canvas) return;

  const old = currentEl;
  if (old) {
    old.classList.add('exiting');
    setTimeout(() => old.remove(), 1100);
  }

  currentSciName = sciName;
  currentEl = createBirdEl(det, sciName);
  canvas.appendChild(currentEl);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    currentEl?.classList.remove('entering');
    currentEl?.classList.add('visible');
  }));
}

function clearCurrent() {
  if (currentEl) {
    const old = currentEl;
    old.classList.add('exiting');
    setTimeout(() => old.remove(), 1100);
    currentEl = null;
    currentSciName = null;
  }
}

function createBirdEl(det: Detection, sciName: string): HTMLElement {
  const settings = state.getSettings();
  const el = document.createElement('div');
  el.className = 'bird-card bird-single entering';

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

  updateLabelContent(el, det, sciName);

  return el;
}

function updateCurrentLabel(det: Detection, sciName: string) {
  if (!currentEl) return;
  updateLabelContent(currentEl, det, sciName);
}

function updateLabelContent(el: HTMLElement, det: Detection, sciName: string) {
  const settings = state.getSettings();
  if (!settings?.show_species_label) {
    el.querySelector('.bird-label')?.remove();
    return;
  }

  let label = el.querySelector<HTMLElement>('.bird-label');
  if (!label) {
    label = document.createElement('span');
    label.className = 'bird-label';
    el.appendChild(label);
  }
  if (settings.font_family) {
    label.style.fontFamily = `'${settings.font_family}', Georgia, serif`;
  }
  const common = commonName(det);
  label.textContent = settings.label_language === 'scientific' ? sciName : (common || sciName);
}

function updateEmptyState() {
  if (!emptyPerch) return;
  emptyPerch.classList.toggle('visible', !currentSciName);
}

export function refreshSettings() {
  // Re-render with current state so label language / font changes apply.
  renderFromState();
}

export function getRenderedBirdCount(): number {
  return currentSciName ? 1 : 0;
}
