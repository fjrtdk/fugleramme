# US-010 — Dashboard Display Settings

## User story

As an authenticated user, I want a settings panel on the dashboard that lets me control how the Fugleramme display looks and behaves, so that I can tune the experience to my screen and preferences without touching any configuration files.

## Acceptance criteria

### General

1. The settings panel is accessible from the dashboard (the hidden view behind the Hero Button flip described in US-003); it does not appear on the display itself.
2. All settings are persisted per user on the server side; they survive a page reload and are restored correctly after logout and re-login.
3. All settings take effect on the live display immediately without a page reload; changes made in the settings panel propagate to the display within 500 ms.
4. The settings panel passes WCAG 2.1 AA accessibility requirements for any text, controls, and colour contrast.

### Display Mode

5. The user can choose one of three display modes: **Collage** (default), **Latest Bird**, **Newest Arrival**.
6. The selected display mode is immediately reflected on the display (see US-004, US-008, US-009).

### Margin

7. The user can set a margin value as a percentage of the short side of the viewport. The range is 0–20%; the default is 4%.
8. The margin setting applies to all display modes.
9. For the single-bird modes (Latest Bird and Newest Arrival), values below 8% produce no visible change to the layout; the control remains active and the stored value is preserved, but the visible effect only begins at 8%.

### Lookback Window (Collage mode only)

10. The user can choose from the following lookback window options: Last 15 minutes, Last hour, Last 6 hours, Today (24 h, **default**), All time.
11. "All time" never drops a species from the collage; the page only grows as new species are detected.
12. The lookback window control is visible and active only when the Display Mode is set to Collage. It is hidden or disabled when Latest Bird or Newest Arrival is selected.
13. The same lookback window value is also used by the Newest Arrival mode (US-009) to determine whether a species is novel.

### Species on the Page (Collage mode only)

14. The user can set a maximum number of species shown simultaneously in the collage. Options: 10, 20, 30, 40 (**default**), 50, Show all.
15. This control is visible and active only when the Display Mode is set to Collage.

### Which Ones to Keep (Collage mode only, when species exceed the limit)

16. When the number of detected species within the lookback window exceeds the configured maximum, the user can choose which species to retain. Options:
    - **The most heard** — keep the species with the most detections within the lookback window (default).
    - **The rarest in the window** — keep the species with the fewest detections within the lookback window.
    - **The rarest all time** — keep the species with the fewest detections ever recorded in the system.
17. This control is visible and active only when the Display Mode is set to Collage and Species on the Page is not set to "Show all".

### Defaults

18. When a user has never saved settings, all defaults apply: Display Mode = Collage, Margin = 4%, Lookback Window = Today (24 h), Species on the Page = 40, Which Ones to Keep = The most heard.

## Non-goals

- Settings for audio capture behaviour (that is US-005).
- Per-device or per-browser settings (all settings are per user, server-side).
- Exporting or importing settings.
- Any settings surface other than the dashboard panel.
- Real-time collaborative settings (one user's changes do not affect another user's session).

## Owner

- `@Contract` — settings API endpoint shape (read and write), the settings entity fields and defaults, error shapes.
- `@Backend` — server-side persistence of settings per user entity (reads and writes via the settings API).
- `@Web` — settings panel UI on the dashboard; applying the persisted settings to the live display in real time.

> **Note to Manager:** `@Contract` must write the settings API contract (endpoint, request/response shapes, field names, defaults) before `@Backend` or `@Web` begin implementation. `@Backend` implements persistence against that contract. `@Web` reads the same contract for both the settings UI and the display logic in US-008 and US-009. This story has three owners across three roles; task cards must be issued separately and sequenced: `@Contract` first, then `@Backend` and `@Web` in parallel (they write to disjoint paths).
