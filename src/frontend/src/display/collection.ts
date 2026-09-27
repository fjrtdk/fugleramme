import type { Detection } from '../types';
import { state } from '../state';
import { resolveArtworkPathSync } from '../lib/artwork';
import { getMassByName } from '../lib/bird-sizes';
import { log } from '../lib/logger';

// Logarithmic scale parameters — log(MAX_MASS_G+1) used as denominator
const MAX_MASS_G = 5000;
const MIN_SIZE_PX = 80;
const MAX_SIZE_PX = 280;

// Padding (px) kept clear between bird bounding boxes
const OVERLAP_PADDING = 12;

interface ActiveBird {
  scientificName: string;
  commonName: string;
  illustrationPath: string | null;
  detectedAt: number;
  size: number;
  x: number;
  y: number;
  el: HTMLElement;
}

const activeBirds = new Map<string, ActiveBird>();
let canvas: HTMLElement | null = null;
let emptyPerch: HTMLElement | null = null;

// Tracks the latest detection timestamp observed for each species, even when
// the shared state store keeps an older higher-confidence detection. This
// drives LRU-style FIFO replacement in the collection.
const speciesLastDetectedAt = new Map<string, number>();

export function mountCollection(canvasEl: HTMLElement, perchEl: HTMLElement) {
  canvas = canvasEl;
  emptyPerch = perchEl;
  speciesLastDetectedAt.clear();
  renderFromState();
  updateEmptyState();
}

export function unmountCollection() {
  activeBirds.forEach(b => { b.el.remove(); });
  activeBirds.clear();
  speciesLastDetectedAt.clear();
  canvas = null;
  emptyPerch = null;
}

export function handleDetection(detections: Detection[]) {
  const now = Date.now();
  for (const d of detections) {
    const sci = scientificName(d);
    if (!sci) continue;
    const ts = detectionTimestamp(d) || now;
    speciesLastDetectedAt.set(sci, Math.max(speciesLastDetectedAt.get(sci) ?? 0, ts));
  }
  // Render from the full state store; the passed array is only used to refresh
  // last-seen timestamps.
  renderFromState();
}

function renderFromState() {
  const settings = state.getSettings();
  if (!settings || !canvas) return;

  const max = settings.max_species ?? Infinity;
  const allDets = state.getDetections();

  // Deduplicate by scientific name; keep highest-confidence / latest entry.
  const bestBySpecies = new Map<string, Detection>();
  for (const d of allDets) {
    const sci = scientificName(d);
    if (!sci) continue;
    const existing = bestBySpecies.get(sci);
    if (!existing || isBetterDetection(d, existing)) {
      bestBySpecies.set(sci, d);
    }
  }

  // Build list with effective detected_at (state timestamp or tracked local).
  const entries = Array.from(bestBySpecies.entries()).map(([sci, det]) => ({
    sci,
    det,
    detectedAt: Math.max(
      detectionTimestamp(det),
      speciesLastDetectedAt.get(sci) ?? 0
    ),
  }));

  // Most recently detected species first; this makes new detections enter the
  // collection and pushes the oldest birds out when max_species is reached.
  entries.sort((a, b) => b.detectedAt - a.detectedAt);

  const selected = entries.slice(0, max);
  log('DEBUG', `collection state has ${allDets.length} detections, rendering ${selected.length} birds`);

  const targetSpecies = new Set(selected.map(e => e.sci));

  // Remove birds that fell out of the top max_species.
  for (const [sci, bird] of activeBirds) {
    if (!targetSpecies.has(sci)) {
      removeBird(sci);
    }
  }

  // Add new birds and refresh metadata/labels for existing ones.
  for (const { sci, det, detectedAt } of selected) {
    if (activeBirds.has(sci)) {
      const bird = activeBirds.get(sci)!;
      bird.detectedAt = detectedAt;
      updateBirdLabel(bird);
    } else {
      addBird(det, sci, detectedAt);
    }
  }

  updateEmptyState();
  log('DISPLAY', `Rendered ${activeBirds.size} birds in collection mode`);
}

// ─── Detection helpers ───────────────────────────────────────────────────────

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

function isBetterDetection(a: Detection, b: Detection): boolean {
  if (a.confidence !== b.confidence) return a.confidence > b.confidence;
  return detectionTimestamp(a) > detectionTimestamp(b);
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function resolveIllustrationPath(det: Detection): string | null {
  const settings = state.getSettings();
  if (!settings) return null;
  const sciName = scientificName(det);
  const common = commonName(det);
  return resolveArtworkPathSync(sciName, common, settings.artwork_style);
}

function addBird(det: Detection, sciName: string, detectedAt: number) {
  if (!canvas) return;

  const mass = state.getMass(sciName) ?? getMassByName(sciName);
  const size = computeSize(mass);
  const settings = state.getSettings()!;
  const { x, y } = computePosition(sciName, mass, settings.margin_percent, size);

  const el = createBirdCard(det, sciName, size, x, y, mass);
  canvas.appendChild(el);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => { el.classList.remove('entering'); el.classList.add('visible'); });
  });

  activeBirds.set(sciName, {
    scientificName: sciName,
    commonName: commonName(det) || sciName,
    illustrationPath: resolveIllustrationPath(det),
    detectedAt,
    size, x, y, el,
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

function createBirdCard(det: Detection, sciName: string, size: number, x: number, y: number, mass: number): HTMLElement {
  const settings = state.getSettings();
  const el = document.createElement('div');
  el.className = 'bird-card entering';

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
  img.onerror = () => {
    el.classList.add('no-illustration');
    img.src = '/icons/silhouette.svg';
  };
  el.appendChild(img);

  updateBirdLabelContent(el, det, sciName);

  return el;
}

function updateBirdLabel(bird: ActiveBird) {
  const det = state.getDetections().find(d => scientificName(d) === bird.scientificName);
  updateBirdLabelContent(bird.el, det ?? { common_name: bird.commonName, species_common: bird.commonName, scientific_name: bird.scientificName, species_scientific: bird.scientificName }, bird.scientificName);
}

function updateBirdLabelContent(el: HTMLElement, det: { common_name?: string; species_common?: string; scientific_name?: string; species_scientific?: string }, sciName: string) {
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
  const common = det.common_name ?? det.species_common ?? '';
  label.textContent = settings.label_language === 'scientific'
    ? sciName
    : (common || sciName);
}

// ─── Sizing ──────────────────────────────────────────────────────────────────

function computeSize(mass: number): number {
  const clamped = Math.min(Math.max(mass, 1), MAX_MASS_G);
  const normalized = Math.log(clamped + 1) / Math.log(MAX_MASS_G + 1);
  return Math.round(MIN_SIZE_PX + normalized * (MAX_SIZE_PX - MIN_SIZE_PX));
}

// ─── Positioning ─────────────────────────────────────────────────────────────

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
  const baseRadius = maxRadius * (1 - normalizedMass * 0.78);
  const baseAngle = (simpleHash(sciName) % 360) * (Math.PI / 180);

  const centerX = W / 2 - size / 2;
  const centerY = H / 2 - size / 2;

  const ANGLE_STEPS = 16;
  const RADIUS_STEPS = 5;

  for (let rStep = 0; rStep < RADIUS_STEPS; rStep++) {
    const radius = baseRadius + rStep * size * 0.65;
    for (let aStep = 0; aStep < ANGLE_STEPS; aStep++) {
      const angle = baseAngle + (aStep * 2 * Math.PI) / ANGLE_STEPS;
      const x = clamp(centerX + Math.cos(angle) * radius, margin, margin + availW - size);
      const y = clamp(centerY + Math.sin(angle) * radius, margin, margin + availH - size);
      if (!overlapsAny(x, y, size)) {
        return { x: Math.round(x), y: Math.round(y) };
      }
    }
  }

  const fbX = clamp(centerX + Math.cos(baseAngle) * baseRadius, margin, margin + availW - size);
  const fbY = clamp(centerY + Math.sin(baseAngle) * baseRadius, margin, margin + availH - size);
  return { x: Math.round(fbX), y: Math.round(fbY) };
}

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

// ─── Empty State ──────────────────────────────────────────────────────────────

function updateEmptyState() {
  if (!emptyPerch) return;
  emptyPerch.classList.toggle('visible', activeBirds.size === 0);
}

// ─── Settings refresh ─────────────────────────────────────────────────────────

export function refreshSettings() {
  const settings = state.getSettings();
  if (!settings || !canvas) return;

  // max_species may have changed; re-render from state.
  renderFromState();

  // Reposition all birds with updated margin and refresh labels.
  activeBirds.forEach((bird, sciName) => {
    const mass = state.getMass(sciName) ?? getMassByName(sciName);
    const { x, y } = computePosition(sciName, mass, settings.margin_percent, bird.size);
    bird.x = x; bird.y = y;
    bird.el.style.left = `${x}px`;
    bird.el.style.top = `${y}px`;
  });
}

export function getRenderedBirdCount(): number {
  return activeBirds.size;
}
