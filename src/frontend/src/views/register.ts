import { register } from '../api/auth';
import { state } from '../state';
import { navigate } from '../router';

export function renderRegister(container: HTMLElement) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <h1 class="auth-logo">Fugleramme</h1>
        <p class="auth-tagline">Create your account</p>
        <form id="register-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <input class="form-input" type="email" id="email" name="email" autocomplete="email" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input class="form-input" type="password" id="password" name="password" autocomplete="new-password" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="confirm-password">Confirm password</label>
            <input class="form-input" type="password" id="confirm-password" name="confirm-password" autocomplete="new-password" required />
          </div>
          <div class="error-message hidden" id="register-error" role="alert"></div>
          <div class="form-group form-consent">
            <label class="consent-label">
              <input class="consent-checkbox" type="checkbox" id="privacy-consent" />
              <span>I have read and agree to the <a class="form-link" href="#privacy">Privacy Policy</a></span>
            </label>
          </div>
          <button class="btn-primary" type="submit" id="register-submit" disabled>Create account</button>
        </form>
        <p class="form-switch">Already have an account? <a class="form-link" href="#login">Sign in</a></p>
      </div>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>('#register-form')!;
  const errorEl = container.querySelector<HTMLElement>('#register-error')!;
  const btn = container.querySelector<HTMLButtonElement>('#register-submit')!;
  const consentCheckbox = container.querySelector<HTMLInputElement>('#privacy-consent')!;

  consentCheckbox.addEventListener('change', () => {
    btn.disabled = !consentCheckbox.checked;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem('confirm-password') as HTMLInputElement).value;

    errorEl.classList.add('hidden');
    errorEl.textContent = '';

    if (password !== confirmPassword) {
      errorEl.textContent = 'Passwords do not match.';
      errorEl.classList.remove('hidden');
      return;
    }

    if (password.length < 8) {
      errorEl.textContent = 'Password must be at least 8 characters.';
      errorEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account\u2026';

    const result = await register(email, password);

    if (result.error) {
      if (result.error.code === 'EMAIL_ALREADY_EXISTS') {
        errorEl.textContent = 'An account with this email already exists.';
      } else {
        errorEl.textContent = result.error.message;
      }
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Create account';
      return;
    }

    if (result.data) {
      state.setToken(result.data.token);
      state.setUser(result.data.user);
    }

    navigate('onboarding');
  });
}
