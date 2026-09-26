import { apiFetch } from './client';
import type { Settings } from '../types';

export async function getSettings() {
  return apiFetch<Settings>('/settings');
}

export async function putSettings(settings: Settings) {
  return apiFetch<Settings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
