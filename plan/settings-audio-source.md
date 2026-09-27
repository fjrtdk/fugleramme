# Plan: Audio source selector + Settings page restructure

## Goal

Add a microphone/input-device selector to the Settings page and rework the Settings UI into clearly grouped sections. The selected device must persist across sessions and the live WebAudio capture graph must rewire when the user changes it.

## Current state

- Settings live in the dashboard view at `src/frontend/src/views/dashboard.ts`.
- Settings are persisted in Supabase `user_settings` (one row per user, upserted on save).
- The `Settings` type and `DEFAULT_SETTINGS` are in `src/frontend/src/types.ts`.
- Settings read/write is in `src/frontend/src/api/settings.ts` with an explicit `SETTINGS_COLUMNS` allow-list.
- Audio capture is in `src/frontend/src/ws/audio.ts`. `startAudio()` calls `navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: { ideal: 16000 } } })` with no device constraint. `stopAudio()` tears down tracks, AudioContext, ScriptProcessor, source node, and WebSocket.
- Audio is started from `src/frontend/src/views/display.ts` when the user flips to the display.

## Proposed Settings sections / grouping

Split the single long settings panel into logical sections, each with its own heading and panel. The order is chosen to match the user's mental flow: input first, then what is shown, then how strictly birds are detected, then where.

1. **Audio input** (new)
   - Microphone / audio source selector
   - Optional "Refresh device list" button (labels can change when devices are plugged/unplugged)
2. **Display**
   - Display mode (collage / latest bird / newest arrival)
   - Margin
   - Collage-only: lookback window, max species, sort order
   - Font family
   - Artwork style
   - Show species label toggle + label language
3. **Detection**
   - Confidence threshold slider
4. **Location**
   - Latitude / longitude inputs
   - "Use my location" button

The existing single Save button can remain at the bottom of the Detection or Location section, or become a sticky footer of the settings area. For minimal change, keep it inside the last section as a row action.

## Where the audio source selector lives

- Primary location: the new **Audio input** section at the top of the Settings page.
- The selector is a `<select>` populated from `navigator.mediaDevices.enumerateDevices()` filtered to `kind === 'audioinput'`.
- Because device labels require microphone permission, the selector initially shows:
  - the persisted device label/id if already known,
  - otherwise a "Default microphone" option and a small "Allow microphone access to see devices" hint/button.
- The selector value is the device's `deviceId`.

## Persistence approach

**Recommendation: persist in Supabase `user_settings`, not local-only.**

Rationale:
- All other user-facing settings already live in `user_settings`, so this keeps the mental model and sync behaviour consistent.
- The user expects their microphone choice to follow their account when they log in on the same or another device.
- Local-only storage would create a divergence: some settings survive logout and some do not, and would not work across browsers.

Implementation:
- Add a nullable `audio_source_device_id text` column to `user_settings` via a new migration.
- Add `audio_source_device_id: string | null` to the `Settings` interface and `DEFAULT_SETTINGS` (`null`).
- Add the column to `SETTINGS_COLUMNS` in `src/frontend/src/api/settings.ts`.
- Save the selected `deviceId` through the existing `putSettings` flow.

Rejected alternative: local-only in `localStorage`/`sessionStorage`. Rejected because it breaks cross-device consistency and because the app already intentionally avoids local storage for JWT; there is no existing localStorage pattern for settings.

## WebAudio rewiring strategy

### Enumerating devices

- Use `navigator.mediaDevices.enumerateDevices()` after permission has been granted.
- Filter to `device.kind === 'audioinput'`.
- Use `device.label` for human-readable names and `device.deviceId` for the selector value.
- If labels are empty (permission not yet granted), fall back to generic "Microphone 1", "Microphone 2" placeholders or a single "Default" option until the user grants permission.

### Starting capture with a selected device

- Change `startAudio(deviceId?: string)` so it builds the `audio` constraint as:
  ```text
  {
    channelCount: 1,
    sampleRate: { ideal: 16000 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : {})
  }
  ```
- If no device is selected, keep today's default behaviour.
- `display.ts` calls `startAudio()` with no argument on first load, but can be changed to pass the persisted device ID from `state.getSettings()`.

### Changing device while recording

To avoid closing the WebSocket every time the user picks a different mic:

1. Add an exported `setAudioDevice(deviceId: string)` (or `restartAudioWithDevice`) in `audio.ts`.
2. If the pipeline is currently recording:
   - Stop and release the current `MediaStream` tracks.
   - Disconnect and drop the old `MediaStreamAudioSourceNode`.
   - Acquire a new `MediaStream` with the chosen `deviceId`.
   - Create a new `MediaStreamAudioSourceNode` from the new stream.
   - Connect it to the existing `ScriptProcessorNode` and `AudioContext`.
   - Keep the existing WebSocket open so detection continuity is preserved.
3. If the pipeline is not recording, simply store the selection; it will be used the next time `startAudio()` runs.

If keeping the WebSocket open across a device swap proves awkward (e.g. because frame timing or sample-rate changes), the acceptable fallback is to call `stopAudio()` followed by `startAudio(deviceId)`. This is a small UX hiccup but is simpler and safe. The plan recommends the keep-WS approach first; the implementer should document the chosen approach.

### Fallback if selected device is unavailable

- If `getUserMedia` with `{ exact: deviceId }` fails (device unplugged), catch the error and retry with the default audio constraint.
- Log the failure and surface a non-blocking status/warning in the UI.

### Permission denied

- Reuse the existing status handler (`setStatusHandler`) so the dashboard/display mic indicator shows "denied".
- In settings, show an inline message with a link/button to re-trigger permission.

## Acceptance criteria

- [ ] A new "Audio input" section appears at the top of Settings.
- [ ] The selector lists available audio input devices after microphone permission is granted.
- [ ] The selected device ID is saved to Supabase `user_settings.audio_source_device_id` via the existing Save button.
- [ ] On reload, the selector restores the previously saved device (or shows "Default" if none was saved).
- [ ] When the user changes the selected device while audio is running, capture continues using the new device without requiring a page reload.
- [ ] Settings page is visually split into Audio input, Display, Detection, and Location sections with clear headings/hints.
- [ ] No regression in existing settings save/load behaviour.
- [ ] A migration is added for the new `audio_source_device_id` column before any code depends on it.

## Files that need changes

| File | Why |
|------|-----|
| `.verdent/supabase/migrations/YYYYMMDDHHMMSS_add_audio_source_device_id.sql` | Add nullable `audio_source_device_id text` column to `user_settings`. |
| `src/frontend/src/types.ts` | Add `audio_source_device_id: string \| null` to `Settings` and `DEFAULT_SETTINGS`. |
| `src/frontend/src/api/settings.ts` | Add `audio_source_device_id` to `SETTINGS_COLUMNS`. |
| `src/frontend/src/ws/audio.ts` | Accept optional device ID in `startAudio`; add device enumeration helper; add rewiring/restart function for device changes while recording. |
| `src/frontend/src/views/dashboard.ts` | Render new Audio input section, populate selector from `enumerateDevices`, wire change handler, include value in saved `Settings`, reorganize existing fields into sections. |
| `src/frontend/src/views/display.ts` | Pass persisted `audio_source_device_id` to `startAudio()` on initial load. |
| `src/frontend/src/styles/main.css` | Add styles for the new section heading/order and any new audio-selector-specific rows if needed; reuse existing `.setting-row`/`.setting-select`/`.setting-subheading` classes where possible. |

## Out of scope

- Adding a gain/volume control or VU meter in settings.
- Renaming the "Display Settings" h2 into a different page route.
- Persisting a per-device volume or per-device sample rate.
- Supporting output-device selection (speakers/headphones).
