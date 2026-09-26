import { auth } from '../lib/supabase';

export function renderLogin(container: HTMLElement) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <h1 class="auth-logo">Fugleramme</h1>
        <p class="auth-tagline">Bird detection display</p>
        <button class="btn-primary" id="sign-in-btn">Sign in</button>
        <p class="form-switch">No account? <a class="form-link" href="#register">Register</a></p>
      </div>
    </div>
  `;

  container.querySelector<HTMLButtonElement>('#sign-in-btn')!
    .addEventListener('click', () => { auth.openSignInModal(); });
}
