import { supabase } from '../lib/supabase';
import { getSettings, putSettings } from '../api/settings';
import { state } from '../state';
import { navigate } from '../router';
import type { Settings } from '../types';

export function renderDashboard(container: HTMLElement, onFlipToDisplay: () => void) {
  const user = state.getUser()!;
  container.innerHTML = `
    <div class="dashboard-page" id="dashboard-inner">
      <header class="dashboard-header">
        <span class="dashboard-greeting">Welcome back, ${escapeHtml(user.username)}</span>
        <button class="btn-logout" id="logout-btn">Log out</button>
      </header>
      <main class="dashboard-main">
        <button class="hero-button" id="hero-btn" aria-label="Start Fugleramme">
          Start Fugleramme
        </button>
      </main>
      <section class="settings-section" aria-label="Display settings">
        <h2 class="settings-heading">Display Settings</h2>
        <div class="settings-panel" id="settings-panel">
          <div class="setting-row">
            <label class="setting-label" for="s-display-mode">Display mode</label>
            <select class="setting-select" id="s-display-mode">
              <option value="collage">Collage</option>
              <option value="latest_bird">Latest Bird</option>
              <option value="newest_arrival">Newest Arrival</option>
            </select>
          </div>
          <div class="setting-row">
            <label class="setting-label" for="s-margin">Margin <span id="s-margin-val">4</span>%</label>
            <input class="setting-range" type="range" id="s-margin" min="0" max="20" step="1" value="4" />
          </div>
          <div class="setting-row collage-only" id="row-lookback">
            <label class="setting-label" for="s-lookback">Lookback window</label>
            <select class="setting-select" id="s-lookback">
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Today (24 h)</option>
              <option value="all">All time</option>
            </select>
          </div>
          <div class="setting-row collage-only" id="row-max-species">
            <label class="setting-label" for="s-max-species">Species on page</label>
            <select class="setting-select" id="s-max-species">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="30">30</option>
              <option value="40">40</option>
              <option value="50">50</option>
              <option value="null">Show all</option>
            </select>
          </div>
          <div class="setting-row collage-only" id="row-sort">
            <label class="setting-label" for="s-sort">Which to keep</label>
            <select class="setting-select" id="s-sort">
              <option value="most_heard">The most heard</option>
              <option value="rarest_window">The rarest in window</option>
              <option value="rarest_all_time">The rarest all time</option>
            </select>
          </div>
          <div class="setting-row setting-row-actions">
            <button class="btn-save-settings" id="save-settings">Save settings</button>
            <span class="settings-save-status hidden" id="save-status"></span>
          </div>
          <p class="settings-data-notice">Detection data is stored locally. Delete your account to remove all data. <a class="settings-privacy-link" href="#privacy">Privacy Policy</a></p>
        </div>
      </section>
    </div>
  `;

  // Load and populate settings
  loadAndPopulateSettings();

  // Hero button: flip to display
  container.querySelector('#hero-btn')!.addEventListener('click', () => {
    onFlipToDisplay();
  });

  // Logout
  container.querySelector('#logout-btn')!.addEventListener('click', async () => {
    await supabase.auth.signOut();
    state.setToken(null);
    state.setUser(null);
    state.setSettings(null);
    navigate('login');
  });

  // Display mode change → show/hide collage-only rows
  const modeSelect = container.querySelector<HTMLSelectElement>('#s-display-mode')!;
  modeSelect.addEventListener('change', () => {
    updateCollageOnlyVisibility(modeSelect.value);
  });

  // Margin slider live label
  const marginSlider = container.querySelector<HTMLInputElement>('#s-margin')!;
  const marginVal = container.querySelector<HTMLElement>('#s-margin-val')!;
  marginSlider.addEventListener('input', () => {
    marginVal.textContent = marginSlider.value;
  });

  // Save settings
  container.querySelector('#save-settings')!.addEventListener('click', async () => {
    await saveSettings(container);
  });

  async function loadAndPopulateSettings() {
    let settings = state.getSettings();
    if (!settings) {
      const res = await getSettings();
      if (res.data) {
        settings = res.data;
        state.setSettings(settings);
      }
    }
    if (settings) populateSettingsForm(container, settings);
  }
}

function populateSettingsForm(container: HTMLElement, s: Settings) {
  const modeEl = container.querySelector<HTMLSelectElement>('#s-display-mode');
  const marginEl = container.querySelector<HTMLInputElement>('#s-margin');
  const marginValEl = container.querySelector<HTMLElement>('#s-margin-val');
  const lookbackEl = container.querySelector<HTMLSelectElement>('#s-lookback');
  const maxSpecEl = container.querySelector<HTMLSelectElement>('#s-max-species');
  const sortEl = container.querySelector<HTMLSelectElement>('#s-sort');

  if (modeEl) modeEl.value = s.display_mode;
  if (marginEl) { marginEl.value = String(s.margin_percent); }
  if (marginValEl) marginValEl.textContent = String(s.margin_percent);
  if (lookbackEl) lookbackEl.value = s.lookback_window;
  if (maxSpecEl) maxSpecEl.value = s.max_species == null ? 'null' : String(s.max_species);
  if (sortEl) sortEl.value = s.species_sort;

  updateCollageOnlyVisibility(s.display_mode);
}

function updateCollageOnlyVisibility(mode: string) {
  const rows = document.querySelectorAll('.collage-only');
  rows.forEach(row => {
    if (mode === 'collage') {
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  });
}

async function saveSettings(container: HTMLElement) {
  const modeEl = container.querySelector<HTMLSelectElement>('#s-display-mode')!;
  const marginEl = container.querySelector<HTMLInputElement>('#s-margin')!;
  const lookbackEl = container.querySelector<HTMLSelectElement>('#s-lookback')!;
  const maxSpecEl = container.querySelector<HTMLSelectElement>('#s-max-species')!;
  const sortEl = container.querySelector<HTMLSelectElement>('#s-sort')!;
  const saveBtn = container.querySelector<HTMLButtonElement>('#save-settings')!;
  const saveStatus = container.querySelector<HTMLElement>('#save-status')!;

  const settings: Settings = {
    display_mode: modeEl.value as Settings['display_mode'],
    margin_percent: parseInt(marginEl.value, 10),
    lookback_window: lookbackEl.value as Settings['lookback_window'],
    max_species: maxSpecEl.value === 'null' ? null : parseInt(maxSpecEl.value, 10),
    species_sort: sortEl.value as Settings['species_sort'],
  };

  saveBtn.disabled = true;
  const res = await putSettings(settings);
  saveBtn.disabled = false;

  if (res.data) {
    state.setSettings(res.data);
    saveStatus.textContent = 'Saved';
    saveStatus.className = 'settings-save-status success';
    setTimeout(() => { saveStatus.className = 'settings-save-status hidden'; }, 2000);
  } else {
    saveStatus.textContent = res.error?.message ?? 'Save failed';
    saveStatus.className = 'settings-save-status error';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
