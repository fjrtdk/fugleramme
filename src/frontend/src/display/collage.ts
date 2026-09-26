import type { Detection } from '../types';
import { state } from '../state';
import { BIRD_LINGER_MS } from '../types';
import { resolveArtworkPathSync } from '../lib/artwork';
import { getMassByName } from '../lib/bird-sizes';
import { log } from '../lib/logger';

// Logarithmic scale parameters — log(MAX_MASS_G+1) used as denominator
const MAX_MASS_G = 5000; // heaviest common display species reference
const MIN_SIZE_PX = 80;
const MAX_SIZE_PX = 280;

// Padding (px) kept clear between bird bounding boxes
const OVERLAP_PADDING = 12;

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

    // Prefer server-supplied mass; fall back to CSV lookup
    const mass = state.getMass(sciName) ?? getMassByName(sciName);
    const now = Date.now();

    if (activeBirds.has(sciName)) {
      // Refresh linger timer only
      const bird = activeBirds.get(sciName)!;
      bird.lastDetected = now;
      clearTimeout(bird.timer);
      bird.timer = setTimeout(() => removeBird(sciName), lingerMs);
    } else {
      addBird(det, sciName, mass, now, settings.margin_percent);
    }
  }

  enforceMaxSpecies(settings);
  updateEmptyState();
  log('DISPLAY', `Rendered ${activeBirds.size} birds in collage mode`);
}

function resolveIllustrationPath(det: Detection): string | null {
  if (det.illustration_path) return det.illustration_path;
  const settings = state.getSettings();
  if (!settings) return null;
  const sciName = det.scientific_name ?? det.species_scientific ?? '';
  const common = det.common_name ?? det.species_common ?? '';
  return resolveArtworkPathSync(sciName, common, settings.artwork_style);
}

function addBird(det: Detection, sciName: string, mass: number, now: number, marginPercent: number) {
  if (!canvas) return;

  const size = computeSize(mass);
  const { x, y } = computePosition(sciName, mass, marginPercent, size);
  const settings = state.getSettings();

  const el = document.createElement('div');
  el.className = 'bird-card entering';

  // Heavier birds render above lighter ones, preserving the natural-history-plate feel
  const normalizedMass = Math.log(mass + 1) / Math.log(MAX_MASS_G + 1);
  el.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;z-index:${Math.round(normalizedMass * 90 + 10)};`;

  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  const illustrationPath = resolveIllustrationPath(det);
  if (illustrationPath) {
    img.src = illustrationPath;
  } else {
    el.classList.add('no-illustration');
    img.src = '/icons/silhouette.svg';
  }
  img.onerror = () => { el.classList.add('no-illustration'); };
  el.appendChild(img);

  // Species label — font and language from settings
  if (settings?.show_species_label) {
    const label = document.createElement('span');
    label.className = 'bird-label';
    if (settings.font_family) {
      label.style.fontFamily = `'${settings.font_family}', Georgia, serif`;
    }
    const commonName = det.common_name ?? det.species_common ?? '';
    label.textContent = settings.label_language === 'scientific'
      ? sciName
      : (commonName || sciName);
    el.appendChild(label);
  }

  canvas.appendChild(el);

  // Double-rAF to trigger CSS transition
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { el.classList.remove('entering'); el.classList.add('visible'); });
  });

  const timer = setTimeout(() => removeBird(sciName), lingerMs);
  activeBirds.set(sciName, {
    scientificName: sciName,
    commonName: det.common_name ?? det.species_common ?? sciName,
    illustrationPath: illustrationPath,
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

// ─── Sizing ──────────────────────────────────────────────────────────────────

/**
 * Logarithmic size mapping.
 * Uses log scale so small birds stay visible and large birds don't dominate.
 * log(1g+1)/log(5001) ≈ 0.08 → 96 px
 * log(100g+1)/log(5001) ≈ 0.55 → 190 px
 * log(5000g+1)/log(5001) = 1.0 → 280 px
 */
function computeSize(mass: number): number {
  const clamped = Math.min(Math.max(mass, 1), MAX_MASS_G);
  const normalized = Math.log(clamped + 1) / Math.log(MAX_MASS_G + 1);
  return Math.round(MIN_SIZE_PX + normalized * (MAX_SIZE_PX - MIN_SIZE_PX));
}

// ─── Positioning ─────────────────────────────────────────────────────────────

/**
 * Compute a position for a new bird.
 *
 * Strategy:
 *  1. Derive a "desired" polar position: heavier → small radius (center),
 *     lighter → large radius (periphery). Angle from species name hash.
 *  2. Try ANGLE_STEPS evenly-spaced angular offsets at the desired radius.
 *  3. If still blocked, step outward by one bird-size increment and retry.
 *  4. Fallback to the raw desired position if nothing clears.
 */
function computePosition(
  sciName: string,
  mass: number,
  marginPercent: number,
  size: number
): { x: number; y: number } {
  if (!canvas) return { x: 0, y: 0 };

  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  const margin = Math.min(W, H) * (marginPercent / 100);
  const availW = W - margin * 2;
  const availH = H - margin * 2;
  if (availW <= 0 || availH <= 0) return { x: margin, y: margin };

  const normalizedMass = Math.log(mass + 1) / Math.log(MAX_MASS_G + 1);
  const maxRadius = Math.min(availW, availH) * 0.42;

  // Heavier birds: radius closer to 0 (center); lighter: closer to maxRadius
  const baseRadius = maxRadius * (1 - normalizedMass * 0.78);

  // Deterministic base angle from species name
  const baseAngle = (simpleHash(sciName) % 360) * (Math.PI / 180);

  const centerX = W / 2 - size / 2;
  const centerY = H / 2 - size / 2;

  const ANGLE_STEPS = 16;
  const RADIUS_STEPS = 5;

  for (let rStep = 0; rStep < RADIUS_STEPS; rStep++) {
    const radius = baseRadius + rStep * size * 0.65;
    for (let aStep = 0; aStep < ANGLE_STEPS; aStep++) {
      const angle = baseAngle + (aStep * 2 * Math.PI) / ANGLE_STEPS;
      const x = clamp(
        centerX + Math.cos(angle) * radius,
        margin,
        margin + availW - size
      );
      const y = clamp(
        centerY + Math.sin(angle) * radius,
        margin,
        margin + availH - size
      );
      if (!overlapsAny(x, y, size)) {
        return { x: Math.round(x), y: Math.round(y) };
      }
    }
  }

  // Fallback: place at desired position regardless
  const fbX = clamp(centerX + Math.cos(baseAngle) * baseRadius, margin, margin + availW - size);
  const fbY = clamp(centerY + Math.sin(baseAngle) * baseRadius, margin, margin + availH - size);
  return { x: Math.round(fbX), y: Math.round(fbY) };
}

/** Returns true if (x, y, size) bounding box overlaps any active bird with padding. */
function overlapsAny(x: number, y: number, size: number): boolean {
  const cx = x + size / 2;
  const cy = y + size / 2;
  for (const bird of activeBirds.values()) {
    const bx = bird.x + bird.size / 2;
    const by = bird.y + bird.size / 2;
    const minDist = (size + bird.size) / 2 + OVERLAP_PADDING;
    const dist = Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2);
    if (dist < minDist) return true;
  }
  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ─── Enforcement ─────────────────────────────────────────────────────────────

function enforceMaxSpecies(settings: { max_species: number | null; species_sort: string }) {
  const max = settings.max_species;
  if (max === null || activeBirds.size <= max) return;

  const birds = Array.from(activeBirds.values());
  if (settings.species_sort === 'most_heard') {
    birds.sort((a, b) => b.lastDetected - a.lastDetected);
  } else {
    birds.sort((a, b) => a.lastDetected - b.lastDetected);
  }

  birds.slice(max).forEach(b => {
    clearTimeout(b.timer);
    removeBird(b.scientificName);
  });
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function updateEmptyState() {
  if (!emptyPerch) return;
  emptyPerch.classList.toggle('visible', activeBirds.size === 0);
}

// ─── Settings refresh ─────────────────────────────────────────────────────────

export function refreshSettings() {
  const settings = state.getSettings();
  if (!settings || !canvas) return;

  // Reposition all birds with updated margin
  activeBirds.forEach((bird, sciName) => {
    const mass = state.getMass(sciName) ?? getMassByName(sciName);
    const { x, y } = computePosition(sciName, mass, settings.margin_percent, bird.size);
    bird.x = x; bird.y = y;
    bird.el.style.left = `${x}px`;
    bird.el.style.top = `${y}px`;
  });

  // Update labels if font or language changed
  activeBirds.forEach(bird => {
    const labelEl = bird.el.querySelector<HTMLElement>('.bird-label');
    if (labelEl && settings.font_family) {
      labelEl.style.fontFamily = `'${settings.font_family}', Georgia, serif`;
    }
  });
}

export function getRenderedBirdCount(): number {
  return activeBirds.size;
}
