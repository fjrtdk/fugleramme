import { supabase } from '../lib/supabase';
import { getSettings, putSettings } from '../api/settings';
import { state } from '../state';
import { navigate } from '../router';
import { renderDiagnostics } from '../components/diagnostics';
import { log } from '../lib/logger';
import type { Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { listAudioInputDevices, restartAudioWithDevice, isAudioRunning } from '../ws/audio';

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
      <section class="settings-section" aria-label="Audio input">
        <h2 class="settings-heading">Audio input</h2>
        <div class="settings-panel" id="audio-settings-panel">
          <div class="setting-row" id="row-audio-source">
            <label class="setting-label" for="s-audio-source">Microphone</label>
            <select class="setting-select" id="s-audio-source">
              <option value="">Default microphone</option>
            </select>
          </div>
          <div class="setting-row setting-row-audio-permission" id="row-audio-permission">
            <span class="audio-permission-hint" id="audio-permission-hint">Allow microphone access to see available devices.</span>
            <button class="btn-audio-permission" id="audio-permission-btn" type="button">Allow microphone</button>
          </div>
        </div>
      </section>
      <section class="settings-section" aria-label="Display">
        <h2 class="settings-heading">Display</h2>
        <div class="settings-panel" id="display-settings-panel">
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
        </div>
      </section>
      <section class="settings-section" aria-label="Detection">
        <h2 class="settings-heading">Detection</h2>
        <div class="settings-panel" id="detection-settings-panel">
          <div class="setting-row" id="row-confidence-threshold">
            <label class="setting-label" for="s-confidence-threshold">Confidence threshold <span id="s-confidence-threshold-val">0.50</span></label>
            <input class="setting-range" type="range" id="s-confidence-threshold" min="0" max="1" step="0.05" value="0.5" />
          </div>
        </div>
      </section>
      <section class="settings-section" aria-label="Location">
        <h2 class="settings-heading">Location</h2>
        <div class="settings-panel" id="location-settings-panel">
          <div class="setting-subheading" id="location-subheading">
            <span class="setting-subheading-label">Coordinates</span>
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
      log('SETTINGS', 'Settings panel closed');
    } else {
      diagSection.classList.remove('hidden');
      diagToggleBtn.setAttribute('aria-expanded', 'true');
      diagToggleBtn.classList.add('active');
      log('SETTINGS', 'Settings panel opened');
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
    log('SETTINGS', `Display mode changed to ${modeSelect.value}`);
    updateCollageOnlyVisibility(modeSelect.value);
  });

  // Margin slider live label
  const marginSlider = container.querySelector<HTMLInputElement>('#s-margin')!;
  const marginVal = container.querySelector<HTMLElement>('#s-margin-val')!;
  marginSlider.addEventListener('input', () => {
    marginVal.textContent = marginSlider.value;
  });

  // Confidence threshold slider live label
  const confidenceSlider = container.querySelector<HTMLInputElement>('#s-confidence-threshold')!;
  const confidenceVal = container.querySelector<HTMLElement>('#s-confidence-threshold-val')!;
  confidenceSlider.addEventListener('input', () => {
    confidenceVal.textContent = parseFloat(confidenceSlider.value).toFixed(2);
  });

  // Font preview: update CSS variable live
  const fontSelect = container.querySelector<HTMLSelectElement>('#s-font-family')!;
  fontSelect.addEventListener('change', () => {
    log('SETTINGS', `Font changed to ${fontSelect.value}`);
    document.documentElement.style.setProperty('--display-font', `'${fontSelect.value}', Georgia, serif`);
  });

  // Artwork style change
  const artworkSelect = container.querySelector<HTMLSelectElement>('#s-artwork-style')!;
  artworkSelect.addEventListener('change', () => {
    log('SETTINGS', `Artwork style changed to ${artworkSelect.value}`);
  });

  // Audio source selector
  const audioSelect = container.querySelector<HTMLSelectElement>('#s-audio-source')!;
  const audioPermissionBtn = container.querySelector<HTMLButtonElement>('#audio-permission-btn')!;
  const audioPermissionHint = container.querySelector<HTMLElement>('#audio-permission-hint')!;
  const audioPermissionRow = container.querySelector<HTMLElement>('#row-audio-permission')!;

  audioSelect.addEventListener('change', async () => {
    const deviceId = audioSelect.value || null;
    log('SETTINGS', `Audio source changed to ${deviceId ?? 'default'}`);
    if (isAudioRunning()) {
      await restartAudioWithDevice(deviceId);
    }
  });

  audioPermissionBtn.addEventListener('click', async () => {
    audioPermissionBtn.disabled = true;
    audioPermissionHint.textContent = 'Requesting microphone access…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      await populateAudioDeviceSelector(container, state.getSettings()?.audio_source_device_id ?? null);
      audioPermissionRow.classList.add('hidden');
    } catch (err: unknown) {
      const message = (err as { message?: string }).message ?? 'Permission denied';
      log('SETTINGS', `Microphone permission request failed: ${message}`);
      audioPermissionHint.textContent = 'Microphone access denied. Enable it in browser settings to select a device.';
      audioPermissionBtn.disabled = false;
    }
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
      if (res.error) {
        log('ERROR', `Failed to load settings: ${res.error.message}`);
      }
      if (res.data) {
        settings = res.data;
        state.setSettings(settings);
        log('SETTINGS', `Loaded settings: ${JSON.stringify(settings)}`);
      }
    } else {
      log('SETTINGS', `Loaded settings: ${JSON.stringify(settings)}`);
    }
    if (settings) await populateSettingsForm(container, settings);
  }
}

async function populateSettingsForm(container: HTMLElement, s: Settings) {
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
  const confidenceEl = container.querySelector<HTMLInputElement>('#s-confidence-threshold');
  const confidenceValEl = container.querySelector<HTMLElement>('#s-confidence-threshold-val');

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
  const confidenceThreshold = s.confidence_threshold ?? DEFAULT_SETTINGS.confidence_threshold;
  if (confidenceEl) confidenceEl.value = String(confidenceThreshold);
  if (confidenceValEl) confidenceValEl.textContent = confidenceThreshold.toFixed(2);

  updateCollageOnlyVisibility(s.display_mode);

  // Apply font immediately
  document.documentElement.style.setProperty(
    '--display-font',
    `'${s.font_family ?? DEFAULT_SETTINGS.font_family}', Georgia, serif`
  );

  // Populate audio device selector asynchronously (needs enumerateDevices)
  await populateAudioDeviceSelector(container, s.audio_source_device_id);
}

async function populateAudioDeviceSelector(container: HTMLElement, selectedDeviceId: string | null) {
  const select = container.querySelector<HTMLSelectElement>('#s-audio-source');
  const permissionRow = container.querySelector<HTMLElement>('#row-audio-permission');
  if (!select || !permissionRow) return;

  const devices = await listAudioInputDevices();
  const hasLabels = devices.some(d => d.label);

  // Keep the "Default microphone" option and append discovered devices.
  select.innerHTML = '<option value="">Default microphone</option>';
  const optionsHtml = devices.map((d, i) => {
    const label = d.label || `Microphone ${i + 1}`;
    return `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(label)}</option>`;
  }).join('');
  select.insertAdjacentHTML('beforeend', optionsHtml);

  // If the saved device is not currently plugged in, preserve it as an option.
  if (selectedDeviceId && !devices.find(d => d.deviceId === selectedDeviceId)) {
    select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(selectedDeviceId)}">Unknown device</option>`);
  }

  select.value = selectedDeviceId ?? '';

  // Only hide the permission prompt once labels are available.
  if (hasLabels) {
    permissionRow.classList.add('hidden');
  } else {
    permissionRow.classList.remove('hidden');
  }
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
  const confidenceEl = container.querySelector<HTMLInputElement>('#s-confidence-threshold')!;
  const audioSourceEl = container.querySelector<HTMLSelectElement>('#s-audio-source')!;
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
    confidence_threshold: parseFloat(confidenceEl.value),
    audio_source_device_id: audioSourceEl.value || null,
  };

  saveBtn.disabled = true;
  const res = await putSettings(settings);
  saveBtn.disabled = false;

  if (res.data) {
    state.setSettings(res.data);
    saveStatus.textContent = 'Saved';
    saveStatus.className = 'settings-save-status success';
    log('SETTINGS', `Saved settings: ${JSON.stringify(res.data)}`);
    setTimeout(() => { saveStatus.className = 'settings-save-status hidden'; }, 2000);
  } else {
    const message = res.error?.message ?? 'Save failed';
    saveStatus.textContent = message;
    saveStatus.className = 'settings-save-status error';
    log('ERROR', `Failed to save settings: ${message}`);
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
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
