# US-008 — Latest Bird Display Mode

## User story

As a user viewing the Fugleramme display, I want a mode that shows only the single most recently detected bird, large and centred on the canvas, so that I can focus on the latest arrival without the visual noise of the full collage.

## Acceptance criteria

1. When the display mode is set to "Latest Bird", the canvas shows exactly one bird illustration at a time — the species most recently detected.
2. The bird illustration is centred on the canvas and scaled to be large (occupying a meaningful proportion of the short side of the viewport), subject to the margin setting from US-010.
3. Margin values below 8% have no visible effect on the single-bird layout; only values of 8% and above widen the border around the illustration.
4. The canvas uses the same textured paper or parchment background and the same vintage natural-history illustration style as US-004.
5. When a new detection arrives (a species different from the one currently shown), the current illustration fades out and the new one fades in; the exact timing and easing are defined by `@Design` tokens.
6. If the same species is detected again while already displayed, no transition plays — the illustration remains stable.
7. When no detections have been received (empty state), the canvas shows the bare perch or branch illustration used in US-004 — no text placeholder, no spinner.
8. The display updates in real time without a page reload; new detections received over the open WebSocket connection are reflected within 500 ms of receipt.
9. The display is fully responsive from 320 px wide through tablet landscape to large desktop.
10. No text labels, species names, or confidence scores appear on the canvas.
11. Switching to Latest Bird mode from another mode (e.g. Collage) is seamless — the canvas transitions without a full page reload.

## Non-goals

- Showing multiple birds simultaneously (that is Collage mode).
- Announcing the species name verbally or via any audio cue.
- Any animation beyond the fade-in/fade-out transition (e.g. animated flight paths).
- Persisting which species was last shown across page reloads (the display always starts from the live WebSocket stream).
- E-ink or low-refresh-rate display mode.

## Owner

`@Web` (single-bird canvas layout, fade transition, empty-state illustration, WebSocket subscription, responsive layout, margin application)

> **Note to Manager:** `@Design` must supply the fade transition tokens (duration, easing) before `@Web` implements AC 5. `@Contract` must define the detection WebSocket message shape (already required by US-004) and the display-mode field on the settings entity (required by US-010). `@Content` must supply the bird illustration assets (already required by US-004).
