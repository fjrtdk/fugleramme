import { auth } from '../lib/supabase';

export function renderRegister(container: HTMLElement) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <h1 class="auth-logo">Fugleramme</h1>
        <p class="auth-tagline">Create your account</p>
        <div class="form-group form-consent">
          <label class="consent-label">
            <input class="consent-checkbox" type="checkbox" id="privacy-consent" />
            <span>I have read and agree to the <a class="form-link" href="#privacy">Privacy Policy</a></span>
          </label>
        </div>
        <button class="btn-primary" id="register-btn" disabled>Create account</button>
        <p class="form-switch">Already have an account? <a class="form-link" href="#login">Sign in</a></p>
      </div>
    </div>
  `;

  const btn = container.querySelector<HTMLButtonElement>('#register-btn')!;
  const checkbox = container.querySelector<HTMLInputElement>('#privacy-consent')!;

  checkbox.addEventListener('change', () => {
    btn.disabled = !checkbox.checked;
  });

  btn.addEventListener('click', () => { auth.openSignInModal(); });
}
