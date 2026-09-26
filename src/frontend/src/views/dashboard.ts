import { supabase } from '../lib/supabase';
import { getSettings, putSettings } from '../api/settings';
import { state } from '../state';
import { navigate } from '../router';
import { renderDiagnostics } from '../components/diagnostics';
import { log } from '../lib/logger';
import type { Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

const FONT_FAMILIES = [
  'Alegreya',
  'Bitter',
  'Cormorant Garamond',
  'EB Garamond',
  'Gentium Book Plus',
  'Libre Baskerville',
  'Playfair Display',
];

export function renderDashboard(container: HTMLElement, onFlipToDisplay: () => void) {
  const user = state.getUser()!;
  const fontOptions = FONT_FAMILIES.map(f =>
    `<option value="${f}">${f}</option>`
  ).join('');

  container.innerHTML = `
    <div class="dashboard-page" id="dashboard-inner">
      <header class="dashboard-header">
        <span class="dashboard-greeting">Welcome back, ${escapeHtml(user.username)}</span>
        <div class="dashboard-header-actions">
          <button class="btn-diag-toggle" id="diag-toggle-btn" aria-expanded="false" aria-controls="diagnostics-section">Diagnostics</button>
          <button class="btn-logout" id="logout-btn">Log out</button>
        </div>
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
          <div class="setting-subheading" id="location-subheading">
            <span class="setting-subheading-label">Location</span>
            <span class="setting-subheading-hint">Used by BirdNET for geographic species priors</span>
          </div>
          <div class="setting-row" id="row-latitude">
            <label class="setting-label" for="s-latitude">Latitude</label>
            <input class="setting-number" type="number" id="s-latitude" min="-90" max="90" step="0.0001" placeholder="e.g. 55.6761" aria-describedby="lat-hint" />
          </div>
          <div class="setting-row" id="row-longitude">
            <label class="setting-label" for="s-longitude">Longitude</label>
            <input class="setting-number" type="number" id="s-longitude" min="-180" max="180" step="0.0001" placeholder="e.g. 12.5683" aria-describedby="lon-hint" />
          </div>
          <div class="setting-row setting-row-location-action">
            <button class="btn-use-location" id="use-location-btn" type="button">Use My Location</button>
            <span class="location-status hidden" id="location-status"></span>
          </div>
          <div class="setting-subheading" id="display-subheading">
            <span class="setting-subheading-label">Display</span>
            <span class="setting-subheading-hint">Font, artwork, and label preferences</span>
          </div>
          <div class="setting-row" id="row-font">
            <label class="setting-label" for="s-font-family">Font</label>
            <select class="setting-select" id="s-font-family">
              ${fontOptions}
            </select>
          </div>
          <div class="setting-row" id="row-artwork-style">
            <label class="setting-label" for="s-artwork-style">Artwork style</label>
            <select class="setting-select" id="s-artwork-style">
              <option value="classic">Classic (hand-cut illustrations)</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div class="setting-row" id="row-show-label">
            <label class="setting-label" for="s-show-label">Show species label</label>
            <label class="setting-toggle" aria-label="Show species label">
              <input type="checkbox" id="s-show-label" />
              <span class="setting-toggle-track"></span>
            </label>
          </div>
          <div class="setting-row" id="row-label-lang">
            <label class="setting-label" for="s-label-lang">Label language</label>
            <select class="setting-select" id="s-label-lang">
              <option value="common">Common name</option>
              <option value="scientific">Scientific name</option>
            </select>
          </div>
          <div class="setting-row setting-row-actions">
            <button class="btn-save-settings" id="save-settings">Save settings</button>
            <span class="settings-save-status hidden" id="save-status"></span>
          </div>
          <p class="settings-data-notice">Detection data is stored locally. Delete your account to remove all data. <a class="settings-privacy-link" href="#privacy">Privacy Policy</a></p>
        </div>
      </section>
      <section class="diagnostics-section hidden" id="diagnostics-section" aria-label="Diagnostics">
        <h2 class="settings-heading">Diagnostics</h2>
        <div id="diagnostics-panel-mount"></div>
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

  // Diagnostics toggle
  const diagToggleBtn = container.querySelector<HTMLButtonElement>('#diag-toggle-btn')!;
  const diagSection = container.querySelector<HTMLElement>('#diagnostics-section')!;
  let diagRendered = false;

  diagToggleBtn.addEventListener('click', () => {
    const isOpen = diagToggleBtn.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      diagSection.classList.add('hidden');
      diagToggleBtn.setAttribute('aria-expanded', 'false');
      diagToggleBtn.classList.remove('active');
    } else {
      diagSection.classList.remove('hidden');
      diagToggleBtn.setAttribute('aria-expanded', 'true');
      diagToggleBtn.classList.add('active');
      if (!diagRendered) {
        const mount = diagSection.querySelector<HTMLElement>('#diagnostics-panel-mount')!;
        renderDiagnostics(mount);
        diagRendered = true;
      }
    }
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

  // Font preview: update CSS variable live
  const fontSelect = container.querySelector<HTMLSelectElement>('#s-font-family')!;
  fontSelect.addEventListener('change', () => {
    document.documentElement.style.setProperty('--display-font', `'${fontSelect.value}', Georgia, serif`);
  });

  // Save settings
  container.querySelector('#save-settings')!.addEventListener('click', async () => {
    await saveSettings(container);
  });

  // Use My Location
  container.querySelector('#use-location-btn')!.addEventListener('click', () => {
    useMyLocation(container);
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
  const latEl = container.querySelector<HTMLInputElement>('#s-latitude');
  const lonEl = container.querySelector<HTMLInputElement>('#s-longitude');
  const fontEl = container.querySelector<HTMLSelectElement>('#s-font-family');
  const artworkEl = container.querySelector<HTMLSelectElement>('#s-artwork-style');
  const showLabelEl = container.querySelector<HTMLInputElement>('#s-show-label');
  const labelLangEl = container.querySelector<HTMLSelectElement>('#s-label-lang');

  if (modeEl) modeEl.value = s.display_mode;
  if (marginEl) { marginEl.value = String(s.margin_percent); }
  if (marginValEl) marginValEl.textContent = String(s.margin_percent);
  if (lookbackEl) lookbackEl.value = s.lookback_window;
  if (maxSpecEl) maxSpecEl.value = s.max_species == null ? 'null' : String(s.max_species);
  if (sortEl) sortEl.value = s.species_sort;
  if (latEl) latEl.value = s.latitude != null ? String(s.latitude) : '';
  if (lonEl) lonEl.value = s.longitude != null ? String(s.longitude) : '';
  if (fontEl) fontEl.value = s.font_family ?? DEFAULT_SETTINGS.font_family;
  if (artworkEl) artworkEl.value = s.artwork_style ?? 'classic';
  if (showLabelEl) showLabelEl.checked = s.show_species_label ?? true;
  if (labelLangEl) labelLangEl.value = s.label_language ?? 'common';

  updateCollageOnlyVisibility(s.display_mode);

  // Apply font immediately
  document.documentElement.style.setProperty(
    '--display-font',
    `'${s.font_family ?? DEFAULT_SETTINGS.font_family}', Georgia, serif`
  );
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
  const latEl = container.querySelector<HTMLInputElement>('#s-latitude')!;
  const lonEl = container.querySelector<HTMLInputElement>('#s-longitude')!;
  const fontEl = container.querySelector<HTMLSelectElement>('#s-font-family')!;
  const artworkEl = container.querySelector<HTMLSelectElement>('#s-artwork-style')!;
  const showLabelEl = container.querySelector<HTMLInputElement>('#s-show-label')!;
  const labelLangEl = container.querySelector<HTMLSelectElement>('#s-label-lang')!;
  const saveBtn = container.querySelector<HTMLButtonElement>('#save-settings')!;
  const saveStatus = container.querySelector<HTMLElement>('#save-status')!;

  const rawLat = latEl.value.trim();
  const rawLon = lonEl.value.trim();
  let latitude: number | null = null;
  let longitude: number | null = null;

  if (rawLat !== '') {
    const v = parseFloat(rawLat);
    if (isNaN(v) || v < -90 || v > 90) {
      saveStatus.textContent = 'Latitude must be between -90 and 90';
      saveStatus.className = 'settings-save-status error';
      return;
    }
    latitude = v;
  }
  if (rawLon !== '') {
    const v = parseFloat(rawLon);
    if (isNaN(v) || v < -180 || v > 180) {
      saveStatus.textContent = 'Longitude must be between -180 and 180';
      saveStatus.className = 'settings-save-status error';
      return;
    }
    longitude = v;
  }

  const settings: Settings = {
    display_mode: modeEl.value as Settings['display_mode'],
    margin_percent: parseInt(marginEl.value, 10),
    lookback_window: lookbackEl.value as Settings['lookback_window'],
    max_species: maxSpecEl.value === 'null' ? null : parseInt(maxSpecEl.value, 10),
    species_sort: sortEl.value as Settings['species_sort'],
    latitude,
    longitude,
    font_family: fontEl.value,
    artwork_style: artworkEl.value as Settings['artwork_style'],
    show_species_label: showLabelEl.checked,
    label_language: labelLangEl.value as Settings['label_language'],
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

function useMyLocation(container: HTMLElement) {
  const locBtn = container.querySelector<HTMLButtonElement>('#use-location-btn')!;
  const locStatus = container.querySelector<HTMLElement>('#location-status')!;
  const latEl = container.querySelector<HTMLInputElement>('#s-latitude')!;
  const lonEl = container.querySelector<HTMLInputElement>('#s-longitude')!;

  if (!('geolocation' in navigator)) {
    log('LOCATION', 'Geolocation API not available');
    locStatus.textContent = 'Geolocation not supported';
    locStatus.className = 'location-status error';
    return;
  }

  log('LOCATION', 'Requesting geolocation');
  locBtn.disabled = true;
  locStatus.textContent = 'Locating…';
  locStatus.className = 'location-status';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = parseFloat(pos.coords.latitude.toFixed(4));
      const lon = parseFloat(pos.coords.longitude.toFixed(4));
      latEl.value = String(lat);
      lonEl.value = String(lon);
      locBtn.disabled = false;
      locStatus.textContent = 'Location set';
      locStatus.className = 'location-status success';
      log('LOCATION', `Geolocation success: ${lat}, ${lon}`);
      setTimeout(() => { locStatus.className = 'location-status hidden'; }, 2000);
    },
    (err) => {
      locBtn.disabled = false;
      locStatus.textContent = err.code === 1 ? 'Permission denied' : 'Could not get location';
      locStatus.className = 'location-status error';
      log('LOCATION', `Geolocation error: ${err.message}`);
    },
    { timeout: 10000 }
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
