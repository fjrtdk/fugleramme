import type { Detection } from '../types';
import { state } from '../state';
import { BIRD_LINGER_MS } from '../types';

const MAX_MASS_G = 5000; // heaviest common garden bird reference
const MIN_SIZE_PX = 80;
const MAX_SIZE_PX = 280;

interface ActiveBird {
  scientificName: string;
  commonName: string;
  illustrationPath: string | null;
  lastDetected: number;
  size: number;
  x: number;
  y: number;
  el: HTMLElement;
  timer: ReturnType<typeof setTimeout>;
}

const activeBirds = new Map<string, ActiveBird>();
let canvas: HTMLElement | null = null;
let emptyPerch: HTMLElement | null = null;
const lingerMs = BIRD_LINGER_MS;

export function mountCollage(canvasEl: HTMLElement, perchEl: HTMLElement) {
  canvas = canvasEl;
  emptyPerch = perchEl;
  updateEmptyState();
}

export function unmountCollage() {
  activeBirds.forEach(b => { clearTimeout(b.timer); b.el.remove(); });
  activeBirds.clear();
  canvas = null;
  emptyPerch = null;
}

export function handleDetection(detections: Detection[]) {
  const settings = state.getSettings();
  if (!settings) return;

  for (const det of detections) {
    const sciName = det.scientific_name ?? det.species_scientific ?? '';
    if (!sciName) continue;

    const mass = state.getMass(sciName) ?? 20;
    const now = Date.now();

    if (activeBirds.has(sciName)) {
      // Refresh timer
      const bird = activeBirds.get(sciName)!;
      bird.lastDetected = now;
      clearTimeout(bird.timer);
      bird.timer = setTimeout(() => removeBird(sciName), lingerMs);
    } else {
      // New bird
      addBird(det, sciName, mass, now, settings.margin_percent);
    }
  }

  enforceMaxSpecies(settings);
  updateEmptyState();
}

function addBird(det: Detection, sciName: string, mass: number, now: number, marginPercent: number) {
  if (!canvas) return;

  const size = computeSize(mass);
  const { x, y } = computePosition(sciName, mass, marginPercent, size);

  const el = document.createElement('div');
  el.className = 'bird-card entering';
  el.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;`;

  const img = document.createElement('img');
  img.alt = ''; // decorative
  img.draggable = false;
  if (det.illustration_path) {
    img.src = det.illustration_path;
  } else {
    el.classList.add('no-illustration');
    img.src = '/icons/silhouette.svg'; // fallback silhouette
  }
  img.onerror = () => { el.classList.add('no-illustration'); };
  el.appendChild(img);

  canvas.appendChild(el);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { el.classList.remove('entering'); el.classList.add('visible'); });
  });

  const timer = setTimeout(() => removeBird(sciName), lingerMs);
  activeBirds.set(sciName, {
    scientificName: sciName,
    commonName: det.common_name ?? det.species_common ?? sciName,
    illustrationPath: det.illustration_path,
    lastDetected: now,
    size, x, y, el, timer,
  });
}

function removeBird(sciName: string) {
  const bird = activeBirds.get(sciName);
  if (!bird) return;
  activeBirds.delete(sciName);
  bird.el.classList.add('exiting');
  bird.el.addEventListener('transitionend', () => bird.el.remove(), { once: true });
  setTimeout(() => bird.el.remove(), 1200); // failsafe
  updateEmptyState();
}

function computeSize(mass: number): number {
  const normalized = Math.sqrt(Math.min(mass, MAX_MASS_G) / MAX_MASS_G);
  return Math.round(MIN_SIZE_PX + normalized * (MAX_SIZE_PX - MIN_SIZE_PX));
}

function computePosition(sciName: string, mass: number, marginPercent: number, size: number): { x: number; y: number } {
  if (!canvas) return { x: 0, y: 0 };

  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  const margin = Math.min(W, H) * (marginPercent / 100);
  const availW = W - margin * 2 - size;
  const availH = H - margin * 2 - size;
  if (availW <= 0 || availH <= 0) return { x: margin, y: margin };

  // Heavier birds: smaller radius from center
  const normalizedMass = Math.sqrt(Math.min(mass, MAX_MASS_G) / MAX_MASS_G);
  const maxRadius = Math.min(availW, availH) * 0.45;
  const radius = maxRadius * (1 - normalizedMass * 0.8);

  // Deterministic angle from species name hash
  const hash = simpleHash(sciName);
  const angle = (hash % 360) * (Math.PI / 180);

  const centerX = W / 2 - size / 2;
  const centerY = H / 2 - size / 2;
  const x = Math.max(margin, Math.min(margin + availW, centerX + Math.cos(angle) * radius));
  const y = Math.max(margin, Math.min(margin + availH, centerY + Math.sin(angle) * radius));

  return { x: Math.round(x), y: Math.round(y) };
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function enforceMaxSpecies(settings: { max_species: number | null; species_sort: string }) {
  const max = settings.max_species;
  if (max === null || activeBirds.size <= max) return;

  // Build sorted list to determine which to remove
  const birds = Array.from(activeBirds.values());

  if (settings.species_sort === 'most_heard') {
    // Keep most recently detected
    birds.sort((a, b) => b.lastDetected - a.lastDetected);
  } else {
    // For rarest: keep the ones detected least; sort oldest-first
    birds.sort((a, b) => a.lastDetected - b.lastDetected);
  }

  const toRemove = birds.slice(max);
  toRemove.forEach(b => {
    clearTimeout(b.timer);
    removeBird(b.scientificName);
  });
}

function updateEmptyState() {
  if (!emptyPerch) return;
  if (activeBirds.size === 0) {
    emptyPerch.classList.add('visible');
  } else {
    emptyPerch.classList.remove('visible');
  }
}

export function refreshSettings() {
  const settings = state.getSettings();
  if (!settings) return;
  // Re-layout: reposition birds with new margin
  if (canvas) {
    activeBirds.forEach((bird, sciName) => {
      const mass = state.getMass(sciName) ?? 20;
      const { x, y } = computePosition(sciName, mass, settings.margin_percent, bird.size);
      bird.x = x; bird.y = y;
      bird.el.style.left = `${x}px`;
      bird.el.style.top = `${y}px`;
    });
  }
}
