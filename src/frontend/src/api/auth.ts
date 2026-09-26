import { apiFetch } from './client';
import type { User } from '../types';

export async function register(email: string, password: string) {
  return apiFetch<{ user: User; token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string) {
  return apiFetch<{ user: User; token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}

export async function getMe() {
  return apiFetch<User>('/auth/me');
}

export async function patchMe(data: Partial<{ username: string; onboarding_seen: boolean }>) {
  return apiFetch<User>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
