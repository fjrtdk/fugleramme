import type { User, Settings, Species } from './types';

// JWT stored in memory only (never localStorage/sessionStorage)
// Used exclusively for WebSocket ?token= param
let _token: string | null = null;
let _user: User | null = null;
let _settings: Settings | null = null;
let _species: Map<string, Species> = new Map(); // keyed by scientific_name

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

  // Helper: get body_mass_g for a scientific name, null if unknown
  getMass: (scientificName: string): number | null => {
    return _species.get(scientificName)?.body_mass_g ?? null;
  },

  isAuthenticated: () => _user !== null,
};
