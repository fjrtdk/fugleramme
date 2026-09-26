import { apiFetch } from './client';
import type { Species } from '../types';

export async function getSpecies() {
  return apiFetch<{ species: Species[] }>('/species');
}
