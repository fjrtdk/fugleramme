import { createClient } from '@supabase/supabase-js';
import { createVerdentAuth } from '@verdent/auth-js';
import type { User } from '../types';

// Same-origin BaaS proxy is used when Verdent-injected env vars are absent (hosted/preview).
// When running against the Python backend locally, set VITE_SUPABASE_URL and
// VITE_SUPABASE_PUBLISHABLE_KEY in a .env file; Verdent Publish injects them automatically.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? window.location.origin;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'verdent-baas-proxy';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const auth = createVerdentAuth({
  supabase,
  ...(import.meta.env.VITE_VERDENT_OAUTH_INITIATE_URL
    ? { oauth: { authorizeUrl: import.meta.env.VITE_VERDENT_OAUTH_INITIATE_URL } }
    : {}),
});

type SbUser = {
  id: string;
  email?: string;
  created_at: string;
  updated_at?: string;
  user_metadata?: Record<string, unknown>;
};

/**
 * Map a Supabase Auth user to the app's User shape.
 * Fields not held by Supabase (username, onboarding_seen) are read from
 * user_metadata, falling back to sensible defaults.
 */
export function supabaseUserToAppUser(sbUser: SbUser): User {
  return {
    id: sbUser.id,
    email: sbUser.email ?? '',
    username:
      (sbUser.user_metadata?.username as string | undefined) ??
      sbUser.email?.split('@')[0] ??
      'User',
    onboarding_seen:
      (sbUser.user_metadata?.onboarding_seen as boolean | undefined) ?? false,
    created_at: sbUser.created_at,
    updated_at: sbUser.updated_at,
  };
}
