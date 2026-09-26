import { supabase } from '../lib/supabase';
import { log } from '../lib/logger';
import type { Species } from '../types';
import type { ApiResponse } from './client';

export async function getSpecies(): Promise<ApiResponse<{ species: Species[] }>> {
  const { data, error } = await supabase
    .from('species')
    .select('common_name, scientific_name, body_mass_g, illustration_path');

  if (error) {
    log('ERROR', `getSpecies DB error: ${error.message}`);
    return { status: 500, error: { code: 'DB_ERROR', message: error.message } };
  }

  return { status: 200, data: { species: (data as Species[]) ?? [] } };
}
