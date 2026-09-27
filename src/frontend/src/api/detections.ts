import { supabase } from '../lib/supabase';
import { log } from '../lib/logger';
import type { Detection } from '../types';

const LOOKBACK_MS: Record<Exclude<'15m' | '1h' | '6h' | '24h' | 'all', 'all'>, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export async function loadDetections(
  lookback: '15m' | '1h' | '6h' | '24h' | 'all' = 'all'
): Promise<Detection[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    log('WARN', 'loadDetections called without authenticated user');
    return [];
  }

  let query = supabase
    .from('detections')
    .select('*')
    .eq('user_id', user.id)
    .order('detected_at', { ascending: false });

  if (lookback !== 'all') {
    const cutoff = new Date(Date.now() - LOOKBACK_MS[lookback]).toISOString();
    query = query.gte('detected_at', cutoff);
  }

  const limit = lookback === 'all' ? 1000 : 500;
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    log('ERROR', `loadDetections DB error: ${error.message}`);
    return [];
  }

  const count = data?.length ?? 0;
  const first = count > 0 ? data![0] : null;
  const firstName = first
    ? ((first.species_scientific as string | undefined) ?? (first.species_common as string | undefined) ?? 'unknown')
    : null;
  log('DEBUG', `loadDetections loaded ${count} rows${firstName ? `, first: ${firstName}` : ''}`);

  return (data ?? []).map(row => mapRowToDetection(row));
}

function mapRowToDetection(row: Record<string, unknown>): Detection {
  return {
    id: row.id as string | undefined,
    species_common: (row.species_common as string) ?? undefined,
    common_name: (row.species_common as string) ?? undefined,
    species_scientific: (row.species_scientific as string) ?? undefined,
    scientific_name: (row.species_scientific as string) ?? undefined,
    confidence: Number(row.confidence ?? 0),
    illustration_path: (row.illustration_path as string | null) ?? null,
    detected_at: (row.detected_at as string) ?? undefined,
    timestamp: (row.detected_at as string) ?? undefined,
  };
}

export async function clearDetections(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    log('WARN', 'clearDetections called without authenticated user');
    return;
  }

  const { error } = await supabase
    .from('detections')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    log('ERROR', `clearDetections DB error: ${error.message}`);
  }
}
