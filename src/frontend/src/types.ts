export interface User {
  id: string;
  email: string;
  username: string;
  onboarding_seen: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Settings {
  display_mode: 'collage' | 'latest_bird' | 'newest_arrival';
  margin_percent: number;
  lookback_window: '15m' | '1h' | '6h' | '24h' | 'all';
  max_species: number | null;
  species_sort: 'most_heard' | 'rarest_window' | 'rarest_all_time';
  latitude: number | null;
  longitude: number | null;
}

export interface Detection {
  id?: string;
  species_code?: string;
  species_common?: string;
  common_name?: string;
  species_scientific?: string;
  scientific_name?: string;
  confidence: number;
  illustration_path: string | null;
  detected_at?: string;
  timestamp?: string;
}

export interface Species {
  common_name: string;
  scientific_name: string;
  body_mass_g: number | null;
  illustration_path: string | null;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  display_mode: 'collage',
  margin_percent: 4,
  lookback_window: '24h',
  max_species: 40,
  species_sort: 'most_heard',
  latitude: null,
  longitude: null,
};

// Linger time for collage birds (default 60 seconds per US-004 AC 9)
export const BIRD_LINGER_MS = 60_000;
// Newest arrival display timeout (default 30 seconds per US-009 AC 4)
export const NEWEST_ARRIVAL_TIMEOUT_MS = 30_000;
