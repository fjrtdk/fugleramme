# US-005 — Audio Capture

## User story

As a user viewing the display, I want the app to capture audio from my device microphone and stream it to the backend, so that the detection engine can identify birds from the live soundscape.

## Acceptance criteria

1. When the display becomes active, the app requests microphone permission via the Web Audio API (`getUserMedia`).
2. If permission is granted, audio capture begins automatically and a mic-status indicator shows "Recording" (green dot or equivalent).
3. If the user denies microphone permission, the display shows a "Microphone access denied" indicator and a prompt explaining that the mic is required for detection; the display canvas still renders but the empty-state perch is shown.
4. The denied state includes a visible action ("Enable microphone") that, when tapped, re-triggers the permission request or opens the browser permission settings if re-requesting is not possible in the current browser context.
5. If the microphone is disconnected or an error occurs after capture has started, the indicator changes to an error state ("Mic error") and the app attempts to restart capture once automatically; if the restart fails, it shows the error state and does not loop indefinitely.
6. Audio is captured as PCM chunks at 16 kHz mono (the sample rate required by BirdNET); the frontend resamples if the device default differs.
7. Audio chunks are sent to the backend over a WebSocket connection (`ws://…/audio`). Each message is a binary frame containing a fixed-duration chunk (e.g. 1 second of audio = 16 000 samples × 2 bytes = 32 KB).
8. The WebSocket connection is established before the first audio chunk is sent and re-established automatically on disconnect (exponential back-off, maximum 5 retries).
9. The mic-status indicator is always visible while the display is active; it does not obstruct bird illustrations.
10. No audio data is stored on the client or sent to any destination other than the backend WebSocket endpoint.
11. Audio capture stops and the WebSocket is closed when the user returns to the dashboard (triple-tap gesture from US-003).

## Non-goals

- Manual mute/unmute toggle (deferred; the display is always-on during normal use).
- Audio level visualiser or waveform display.
- Selecting a specific input device (uses the system default).
- Recording audio to a file for later playback.
- Any audio processing on the client beyond resampling to 16 kHz.

## Owner

`@Web` (getUserMedia, Web Audio API resampling, WebSocket client, mic-status indicator, reconnect logic)

> **Note to Manager:** `@Contract` must define the audio WebSocket endpoint URL, the binary frame format, and the handshake/auth mechanism before `@Web` can implement AC 7–8.
