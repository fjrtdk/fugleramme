import { state } from './state';
import { getMe } from './api/auth';
import { getSettings } from './api/settings';
import { getSpecies as fetchSpecies } from './api/species';
import { renderLogin } from './views/login';
import { renderRegister } from './views/register';
import { renderOnboarding } from './views/onboarding';
import { renderDashboard } from './views/dashboard';
import { renderDisplay, cleanupDisplay } from './views/display';
import { renderPrivacy } from './views/privacy';

const app = () => document.getElementById('app')!;

type Route = 'login' | 'register' | 'onboarding' | 'dashboard' | 'privacy';

export function navigate(route: Route) {
  location.hash = route;
}

let currentDisplayContainer: HTMLElement | null = null;
let appLayerEl: HTMLElement | null = null;
let dashLayerEl: HTMLElement | null = null;
let dispLayerEl: HTMLElement | null = null;
let isDisplayActive = false;

async function route() {
  const hash = (location.hash.replace('#', '') || 'login') as Route;
  const root = app();

  // Privacy page — accessible without auth
  if (hash === 'privacy') {
    root.innerHTML = '';
    renderPrivacy(root);
    return;
  }

  // Check auth for protected routes
  if (['dashboard', 'onboarding'].includes(hash)) {
    if (!state.isAuthenticated()) {
      // Try to restore session via cookie
      const res = await getMe();
      if (res.data) {
        state.setUser(res.data);
        // Token is in memory only — WS won't work until user re-logs in manually
        // But we can still show the dashboard for non-WS features
      } else {
        navigate('login');
        return;
      }
    }

    // Check if returning user who already saw onboarding going to onboarding
    if (hash === 'onboarding' && state.getUser()?.onboarding_seen) {
      navigate('dashboard');
      return;
    }
  }

  // Redirect authenticated users away from auth screens
  if (['login', 'register'].includes(hash) && state.isAuthenticated()) {
    navigate('dashboard');
    return;
  }

  // Clear display state if navigating away from app
  if (['login', 'register', 'onboarding'].includes(hash)) {
    if (currentDisplayContainer) {
      cleanupDisplay(currentDisplayContainer);
      currentDisplayContainer = null;
    }
    isDisplayActive = false;
    appLayerEl = null;
    dashLayerEl = null;
    dispLayerEl = null;
    root.innerHTML = '';
  }

  if (hash === 'login') {
    root.innerHTML = '';
    renderLogin(root);
  } else if (hash === 'register') {
    root.innerHTML = '';
    renderRegister(root);
  } else if (hash === 'onboarding') {
    root.innerHTML = '';
    renderOnboarding(root);
  } else if (hash === 'dashboard') {
    // Dashboard + Display layers
    if (!appLayerEl) {
      root.innerHTML = '';

      appLayerEl = document.createElement('div');
      appLayerEl.className = 'app-layers';

      dashLayerEl = document.createElement('div');
      dashLayerEl.className = 'dashboard-layer';

      dispLayerEl = document.createElement('div');
      dispLayerEl.className = 'display-layer';

      appLayerEl.appendChild(dashLayerEl);
      appLayerEl.appendChild(dispLayerEl);
      root.appendChild(appLayerEl);

      // Pre-load settings and species
      const [settingsRes, speciesRes] = await Promise.all([getSettings(), fetchSpecies()]);
      if (settingsRes.data) state.setSettings(settingsRes.data);
      if (speciesRes.data) state.setSpecies(speciesRes.data.species);

      // Render dashboard
      renderDashboard(dashLayerEl, () => flipToDisplay());

      // Render display (hidden until flip)
      renderDisplay(dispLayerEl, () => flipToDashboard());
      currentDisplayContainer = dispLayerEl;
    }
  }
}

function flipToDisplay() {
  if (!appLayerEl || isDisplayActive) return;
  isDisplayActive = true;
  appLayerEl.classList.add('flip-active');
  appLayerEl.classList.remove('flip-reverse');
}

function flipToDashboard() {
  if (!appLayerEl || !isDisplayActive) return;
  isDisplayActive = false;
  appLayerEl.classList.remove('flip-active');
  appLayerEl.classList.add('flip-reverse');
  setTimeout(() => { appLayerEl?.classList.remove('flip-reverse'); }, 800);
}

export function initRouter() {
  window.addEventListener('hashchange', () => { route(); });
  route();
}
