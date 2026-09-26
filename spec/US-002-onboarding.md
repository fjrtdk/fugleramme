# US-002 — Welcome & Onboarding

## User story

As a first-time authenticated user, I want to see a brief welcome and onboarding message after registering, so that I understand what Fugleramme does before I see the display.

## Acceptance criteria

1. Immediately after successful registration (and only then), the user is routed to an `/onboarding` route before reaching the dashboard.
2. The onboarding screen displays a welcome message that explains the core concept: the app listens for birdsong and shows a vintage illustrated display of detected species.
3. The onboarding screen contains a single call-to-action button ("Get started" or equivalent) that navigates to the dashboard.
4. The onboarding screen explains the triple-tap gesture required to return to the dashboard from the display view.
5. A `onboarding_seen` flag is written to the user record (or session) when the user taps "Get started".
6. A returning user who logs in and whose `onboarding_seen` flag is true is routed directly to the dashboard, skipping `/onboarding` entirely.
7. If an authenticated user navigates to `/onboarding` directly and their `onboarding_seen` flag is already true, they are redirected to the dashboard.
8. The onboarding layout is responsive and legible on screens from 320 px wide to desktop.
9. The onboarding copy fits on a single screen without scrolling on a 375 × 667 px viewport (iPhone SE equivalent).

## Non-goals

- Multi-step wizard or carousel onboarding — one screen only.
- Onboarding video or animation tutorial.
- Ability to replay onboarding from settings (deferred).
- Collecting user preferences during onboarding (deferred).

## Owner

`@Web` (onboarding UI, routing logic, reading/writing `onboarding_seen` flag via the API)

> **Note to Manager:** the `onboarding_seen` flag must be part of the user entity in the contract. Ensure `@Contract` includes this field in the user schema and the relevant API response (e.g. `GET /auth/me`) before dispatching `@Web`.
