import type { Detection } from '../types';

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
}

function createBirdEl(det: Detection): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bird-card bird-single entering';
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
  emptyPerch.classList.toggle('visible', !currentSciName);
}

export function refreshSettings() {
  // margin is applied via CSS on bird-single class
}
