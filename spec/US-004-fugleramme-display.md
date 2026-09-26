# US-004 — Fugleramme Display

## User story

As a user who has started the display, I want to see detected birds as vintage illustrations on a beautiful, textured nature-aesthetic canvas, so that Fugleramme feels like an elegant, living artwork rather than a data dashboard.

## Acceptance criteria

1. The display occupies the full viewport with no visible browser chrome competing with the content.
2. The background is a textured paper or parchment surface evoking a vintage natural-history illustration style (reference aesthetic: https://arnegiacomo.dev).
3. Detected birds are rendered as individual vintage-style illustrations; each illustration corresponds to the detected species and is sourced from the bundled artwork assets (`assets/artwork/`).
4. Each bird illustration is positioned on the canvas such that larger birds (by real body mass) appear larger and toward the centre; smaller birds appear smaller and toward the edges.
5. Sizing is proportional: the illustration of a species with twice the body mass of another is rendered at a visibly larger size, using a defined scaling function (e.g. square-root of mass ratio mapped to a min–max pixel range).
6. When a new detection arrives via WebSocket, the corresponding bird illustration appears on the canvas with a smooth entrance (fade-in or similar — exact motion defined by `@Design` tokens).
7. When no detections are present (empty state), the canvas shows a bare, unoccupied perch or branch illustration — no text placeholder, no spinner.
8. The display updates in real time without a full page reload; detections received over the open WebSocket connection are reflected within 500 ms of receipt.
9. Birds remain visible on the display for a configurable duration (default: 60 seconds) after their last detection, then fade out. Duration is configurable via a constant, not hard-coded in multiple places.
10. The display is fully responsive: the layout reflows gracefully from 320 px wide (phone portrait) through tablet landscape to large desktop.
11. On devices that support it (e.g. mobile browsers), the display requests fullscreen or at minimum hides the browser address bar.
12. No text labels, scientific names, or confidence scores are displayed on the canvas in this phase — illustrations only.
13. The display passes WCAG 2.1 AA colour-contrast for any text that does appear (e.g. mic-status indicator from US-005).

## Non-goals

- Species name labels or tooltips on illustrations (deferred).
- Confidence score display on the canvas.
- User-configurable layout or arrangement of birds.
- Sound playback of birdsong.
- Animation beyond entrance/exit transitions (e.g. animated flapping wings — deferred).
- E-ink rendering or low-refresh-rate display mode.

## Owner

`@Web` (canvas layout, illustration rendering, sizing algorithm, WebSocket subscription, empty-state illustration, responsive layout)

> **Note to Manager:** `@Content` must supply the bird illustration assets and the body-mass lookup data before `@Web` can implement AC 4–5. `@Contract` must define the detection WebSocket message shape before `@Web` can implement AC 6–8.
