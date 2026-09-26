# US-009 — Newest Arrival Display Mode

## User story

As a user viewing the Fugleramme display, I want a mode that highlights whenever a species appears for the first time within the current lookback window, so that the moment a new bird is detected feels special and notable.

## Acceptance criteria

1. When the display mode is set to "Newest Arrival", the canvas monitors incoming detections for species that have not appeared within the current lookback window.
2. The lookback window used to determine novelty is the same lookback window configured in US-010 (default: Today / 24 h). A species seen at any point within that window is not considered new.
3. When a species is detected for the first time in the current lookback window, it is shown prominently and centred on the canvas in a manner that conveys emphasis — for example, rendered slightly larger than the standard Latest Bird size, or with a subtle visual treatment defined by `@Design` tokens. The exact treatment is `@Design`'s decision.
4. The arrival remains prominently displayed for a configurable timeout (default: 30 seconds). The timeout value is a named constant, not hard-coded in multiple places.
5. After the timeout, the display returns to whichever mode was active before — Collage or Latest Bird, as configured in US-010. If no prior mode exists (Newest Arrival is the only active mode), the display falls back to Collage.
6. If a second novel species is detected while an arrival is already being shown, it queues behind the current one. The queue is shown in order of detection. Queued arrivals do not interrupt the current countdown.
7. Once a species has been featured as a newest arrival in the current session, it is not shown again as a newest arrival until it falls outside the lookback window and reappears.
8. The canvas uses the same textured paper or parchment background and vintage illustration style as US-004.
9. When no detections have been received (empty state), the canvas shows the bare perch or branch illustration — no text placeholder, no spinner.
10. Margin values below 8% have no visible effect on the single-bird layout; only values of 8% and above widen the border around the illustration.
11. The display updates in real time without a page reload; new detections are processed within 500 ms of receipt over the open WebSocket connection.
12. The display is fully responsive from 320 px wide through tablet landscape to large desktop.
13. No text labels, species names, or confidence scores appear on the canvas.

## Non-goals

- Playing a sound effect or audio announcement on a new arrival.
- Showing a persistent "recently arrived" list or badge.
- Novelty detection based on anything other than the configured lookback window (e.g. life lists, seasonal firsts).
- Interrupting a currently displayed arrival with a newly detected one.
- E-ink or low-refresh-rate display mode.

## Owner

`@Web` (novelty detection logic, arrival queue management, prominent display rendering, timeout countdown, fallback to prior mode, WebSocket subscription, responsive layout)

> **Note to Manager:** `@Contract` must define the display-mode field and the lookback window on the settings entity (US-010) before `@Web` can implement AC 1–2. `@Design` must supply the emphasis treatment tokens (AC 3) before `@Web` implements that detail. `@Content` must supply the bird illustration assets (already required by US-004).
