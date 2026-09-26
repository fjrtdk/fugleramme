import { supabase } from '../lib/supabase';
import { log } from '../lib/logger';
import type { Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import type { ApiResponse } from './client';

const SETTINGS_COLUMNS = [
  'display_mode', 'margin_percent', 'lookback_window', 'max_species', 'species_sort',
  'latitude', 'longitude',
  'font_family', 'artwork_style', 'show_species_label', 'label_language',
].join(', ');

export async function getSettings(): Promise<ApiResponse<Settings>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: 401, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  }

  const { data, error } = await supabase
    .from('user_settings')
    .select(SETTINGS_COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    log('ERROR', `getSettings DB error: ${error.message}`);
    return { status: 500, error: { code: 'DB_ERROR', message: error.message } };
  }

  // No row yet → return documented defaults (upserted on first PUT)
  return { status: 200, data: (data as Settings | null) ?? { ...DEFAULT_SETTINGS } };
}

export async function putSettings(settings: Settings): Promise<ApiResponse<Settings>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: 401, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } };
  }

  const { data, error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: user.id, ...settings },
      { onConflict: 'user_id' }
    )
    .select(SETTINGS_COLUMNS)
    .single();

  if (error) {
    log('ERROR', `putSettings DB error: ${error.message}`);
    return { status: 500, error: { code: 'DB_ERROR', message: error.message } };
  }

  return { status: 200, data: data as unknown as Settings };
}
