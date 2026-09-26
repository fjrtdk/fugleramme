import { login } from '../api/auth';
import { state } from '../state';
import { navigate } from '../router';

export function renderLogin(container: HTMLElement) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <h1 class="auth-logo">Fugleramme</h1>
        <p class="auth-tagline">Bird detection display</p>
        <form id="login-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <input class="form-input" type="email" id="email" name="email" autocomplete="email" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input class="form-input" type="password" id="password" name="password" autocomplete="current-password" required />
          </div>
          <div class="error-message hidden" id="login-error" role="alert"></div>
          <button class="btn-primary" type="submit">Sign in</button>
        </form>
        <p class="form-switch">No account? <a class="form-link" href="#register">Register</a></p>
      </div>
    </div>
  `;

  const form = container.querySelector<HTMLFormElement>('#login-form')!;
  const errorEl = container.querySelector<HTMLElement>('#login-error')!;
  const btn = container.querySelector<HTMLButtonElement>('.btn-primary')!;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    errorEl.classList.add('hidden');
    errorEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in\u2026';

    const result = await login(email, password);

    if (result.error) {
      errorEl.textContent = result.error.code === 'INVALID_CREDENTIALS'
        ? 'Invalid email or password.'
        : result.error.message;
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Sign in';
      return;
    }

    if (result.data) {
      state.setToken(result.data.token);
      state.setUser(result.data.user);
    }

    navigate('dashboard');
  });
}
