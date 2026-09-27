import type { User, Settings, Species, Detection } from './types';

// JWT stored in memory only (never localStorage/sessionStorage)
// Used exclusively for WebSocket ?token= param
let _token: string | null = null;
let _user: User | null = null;
let _settings: Settings | null = null;
let _species: Map<string, Species> = new Map(); // keyed by scientific_name
let _detections: Detection[] = [];

export const state = {
  getToken: () => _token,
  setToken: (t: string | null) => { _token = t; },

  getUser: () => _user,
  setUser: (u: User | null) => { _user = u; },

  getSettings: () => _settings,
  setSettings: (s: Settings | null) => { _settings = s; },

  getSpecies: () => _species,
  setSpecies: (list: Species[]) => {
    _species = new Map(list.map(s => [s.scientific_name, s]));
  },

  getDetections: () => _detections,
  setDetections: (d: Detection[]) => { _detections = d; },
  addDetection: (d: Detection) => {
    const key = d.scientific_name ?? d.species_scientific;
    if (!key) {
      _detections.push(d);
      return;
    }
    const idx = _detections.findIndex(
      existing => (existing.scientific_name ?? existing.species_scientific) === key
    );
    if (idx === -1) {
      _detections.push(d);
    } else {
      const existing = _detections[idx];
      const existingTime = existing.detected_at ?? existing.timestamp ?? '';
      const newTime = d.detected_at ?? d.timestamp ?? '';
      if (d.confidence > existing.confidence || (d.confidence === existing.confidence && newTime > existingTime)) {
        _detections[idx] = d;
      }
    }
  },
  clearDetections: () => { _detections = []; },

  // Helper: get body_mass_g for a scientific name, null if unknown
  getMass: (scientificName: string): number | null => {
    return _species.get(scientificName)?.body_mass_g ?? null;
  },

  isAuthenticated: () => _user !== null,
};
