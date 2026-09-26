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
  updateEmptyState();
}

export function unmountLatestBird() {
  currentEl?.remove();
  currentEl = null;
  currentSciName = null;
  canvas = null;
  emptyPerch = null;
}

export function handleDetection(detections: Detection[]) {
  if (!detections.length) return;
  const det = detections[detections.length - 1]!; // most recent
  const sciName = det.scientific_name ?? det.species_scientific ?? '';
  if (!sciName || sciName === currentSciName) return; // same species, no change

  // Fade out current, fade in new
  if (currentEl) {
    const old = currentEl;
    old.classList.add('exiting');
    setTimeout(() => old.remove(), 1100);
  }

  currentSciName = sciName;
  currentEl = createBirdEl(det);
  canvas!.appendChild(currentEl);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    currentEl?.classList.remove('entering');
    currentEl?.classList.add('visible');
  }));

  updateEmptyState();
  log('DISPLAY', 'Rendered 1 bird in latest_bird mode');
}

function createBirdEl(det: Detection): HTMLElement {
  const settings = state.getSettings();
  const el = document.createElement('div');
  el.className = 'bird-card bird-single entering';

  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;

  const sciName = det.scientific_name ?? det.species_scientific ?? '';
  const common = det.common_name ?? det.species_common ?? '';
  const artStyle = settings?.artwork_style ?? 'classic';
  const illustrationPath = det.illustration_path
    ?? resolveArtworkPathSync(sciName, common, artStyle);

  if (illustrationPath) {
    img.src = illustrationPath;
  } else {
    el.classList.add('no-illustration');
    img.src = '/icons/silhouette.svg';
  }
  img.onerror = () => el.classList.add('no-illustration');
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
  emptyPerch.classList.toggle('visible', !currentSciName);
}

export function refreshSettings() {
  // margin is applied via CSS on bird-single class
}

export function getRenderedBirdCount(): number {
  return currentSciName ? 1 : 0;
}
