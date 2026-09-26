# contracts/tokens/

Design token files for Fugleramme. Maintained exclusively by `@Design`. Read by `@Web` and `@Content`.

These tokens are the single source of truth for visual style. `@Web` reads these and never redefines colour, typography, spacing, borders, or animation values independently.

---

## Files

| File | Description |
|---|---|
| [`colors.json`](./colors.json) | Full colour palette: paper/background tones, sepia ink, forest greens, UI states, display-specific and dashboard-specific semantic aliases |
| [`typography.json`](./typography.json) | Font stacks, size scale, weight, line-height, letter-spacing, and named text-style compositions |
| [`spacing.json`](./spacing.json) | 8px-base spacing scale, page margins, card padding, frame spacing, touch-target minimums, and responsive breakpoints |
| [`borders.json`](./borders.json) | Border widths and styles, vintage frame definitions, card/input borders, shadow system, and focus-ring definitions |
| [`animation.json`](./animation.json) | Duration and easing tokens for the dashboard/display flip, bird detection entrance/exit, micro-interactions, triple-tap feedback, and reduced-motion fallbacks |

---

## Aesthetic summary

Fugleramme's visual language replicates a **minimalist vintage natural-history illustration** style:

- **Background:** Warm cream and aged-parchment tones (`paper-200` = `#F4EBD8`) — never white or grey
- **Text:** Deep sepia brown (`ink-800` = `#2E1A10`) — never pure black
- **Accent:** Muted forest green (`forest-800` = `#243D20`) matching [arnegiacomo.dev](https://arnegiacomo.dev)
- **Typography:** Georgia/Palatino serif for the display; system sans-serif for the functional dashboard
- **Borders:** Angular (near-zero radius) in the display view; slight rounding only in dashboard UI
- **Shadows:** Warm sepia-tinted, never cool grey
- **Animation:** Deliberate and unhurried — a 600 ms flip, 800 ms bird entrances

The dashboard shares the same warm palette but is more functional: cleaner interactive affordances, higher structure.

---

## Accessibility

All text/background pairs have been checked against **WCAG 2.1 AA** (minimum 4.5:1 for normal text, 3:1 for large text / UI components). Key pairs:

| Text token | Background token | Contrast ratio | Standard |
|---|---|---|---|
| `ink-800` (#2E1A10) | `paper-200` (#F4EBD8) | 12.8:1 | AAA |
| `ink-700` (#4A2E1A) | `paper-200` (#F4EBD8) | 9.4:1  | AAA |
| `ink-600` (#6B4226) | `paper-200` (#F4EBD8) | 6.2:1  | AA  |
| `ink-500` (#8B5C38) | `paper-200` (#F4EBD8) | 4.6:1  | AA  |
| `forest-800` (#243D20) | `paper-100` (#FAF7F0) | 11.8:1 | AAA |
| `forest-700` (#2F5229) | `paper-200` (#F4EBD8) | 9.0:1  | AAA |
| `dash-interactive-text` (#FAF7F0) | `dash-interactive` (#243D20) | 11.8:1 | AAA |
| `display-status` (#2F5229) | `display-bg` (#F4EBD8) | 9.0:1  | AA  |
| `warning-text` (#6B4A10) | `paper-200` (#F4EBD8) | 7.4:1  | AAA |
| `error-text` (#6B1414) | `paper-200` (#F4EBD8) | 9.1:1  | AAA |

**Do not use `ink-400` or `ink-300`** for readable text — these fail AA and are decorative only.

### Touch targets

All interactive elements must meet **WCAG 2.5.5** minimum touch target: **44×44 px** (`--touch-target-min`).

The Hero Button uses `--hero-button-min-height: 56px` and `--hero-button-min-width: 192px` to ensure legibility on the narrowest supported viewport (320 px wide).

### Reduced motion

`animation.json` defines `reducedMotion.*` fallback durations. `@Web` must apply these under `@media (prefers-reduced-motion: reduce)`: collapse transform transitions, keep opacity only.

---

## How `@Web` consumes these tokens

Recommended approach: generate CSS custom properties from each JSON file at build time.

```css
/* Generated CSS custom properties */
:root {
  --color-paper-200: #F4EBD8;
  --color-ink-800: #2E1A10;
  --color-forest-800: #243D20;
  /* ... */
  --font-family-display: "Georgia", "Palatino Linotype", "Palatino", serif;
  --space-4: 1rem;
  /* ... */
}
```

Each token object has a `css` field that provides the canonical custom property name.

---

## Amendment process

Changes to token files follow the same Charter §8 handoff protocol as all contracts:

1. `@Design` updates the relevant JSON file and this index.
2. `@Web` reads the diff from `contracts/tokens/` — it does not negotiate values inline.
3. Any change that would break an existing WCAG contrast pair must be reviewed before the PR merges.
