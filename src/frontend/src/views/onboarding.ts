import { supabase } from '../lib/supabase';
import { log } from '../lib/logger';
import { state } from '../state';
import { navigate } from '../router';

export function renderOnboarding(container: HTMLElement) {
  const user = state.getUser();
  container.innerHTML = `
    <div class="onboarding-page">
      <div class="onboarding-card">
        <h1 class="onboarding-title">Welcome to Fugleramme</h1>
        <div class="onboarding-body">
          <p>Fugleramme listens to the soundscape around you and displays the birds it detects as beautiful vintage illustrations &mdash; like a living field guide on your wall.</p>
          <p>Tap <strong>Start Fugleramme</strong> on the dashboard to open the display. Your phone&rsquo;s microphone will begin listening immediately.</p>
          <p class="onboarding-gesture-hint"><strong>To return to the dashboard:</strong> tap the screen three times quickly.</p>
          <p class="onboarding-privacy-notice">Fugleramme listens through your microphone to identify birds. All audio processing happens on this device &mdash; no audio recordings are stored or transmitted to any external server. Bird detections (species name, confidence, time) are saved to your account.</p>
        </div>
        <button class="btn-primary" id="get-started">Get started</button>
        ${user ? '' : ''}
      </div>
    </div>
  `;

  container.querySelector('#get-started')!.addEventListener('click', async () => {
    // Supabase user_metadata is the only store the app reads onboarding_seen
    // from (see supabaseUserToAppUser in ../lib/supabase). A failed write must
    // not trap the user here, so fall through to the dashboard regardless.
    const { error } = await supabase.auth.updateUser({ data: { onboarding_seen: true } });
    if (error) log('onboarding', `failed to persist onboarding_seen: ${error.message}`);
    const u = state.getUser();
    if (u) state.setUser({ ...u, onboarding_seen: true });
    navigate('dashboard');
  });
}
