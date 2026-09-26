# US-003 — Dashboard & Display Flip

## User story

As an authenticated user, I want a dashboard with a prominent Hero Button that flips the screen to the Fugleramme display, and I want to return to the dashboard by triple-tapping the display, so that the display feels immersive and the dashboard stays hidden during normal use.

## Acceptance criteria

1. After completing onboarding (or on subsequent logins), the user lands on the dashboard at `/dashboard`.
2. The dashboard is only accessible to authenticated users; unauthenticated requests are redirected to `/login`.
3. The dashboard contains a single prominent Hero Button labelled "Start Fugleramme" (or equivalent).
4. Tapping/clicking the Hero Button transitions the view to the Fugleramme display (see US-004). The URL MAY change (e.g. to `/display`) or the transition MAY be a client-side overlay — the contract will specify.
5. While the display is active, the dashboard is fully hidden — not merely obscured — from the DOM or rendered off-screen.
6. To return to the dashboard from the display, the user must tap or click anywhere on the display surface exactly three times within a 1.5-second window.
7. A triple-tap that does not complete within 1.5 seconds resets the counter to zero; partial taps do not accidentally trigger the transition.
8. No button, link, swipe gesture, or keyboard shortcut other than the triple-tap returns the user from the display to the dashboard.
9. The triple-tap gesture works on both touch (mobile) and pointer (mouse/trackpad) devices.
10. The dashboard shows the user's email or a greeting ("Welcome back") to confirm authentication.
11. The dashboard contains a Log out action.
12. The Hero Button is visually prominent, centred, and clearly communicates its purpose on screens from 320 px wide to desktop.

## Non-goals

- Multiple buttons or navigation items on the dashboard in this phase.
- Settings, profile editing, or notification preferences on the dashboard (deferred).
- Swipe gesture or shake gesture as a return mechanism.
- Keyboard shortcut as an alternative return path.
- Animation specification (that is `@Design` and `@Web`'s concern from the design tokens).

## Owner

`@Web` (dashboard layout, Hero Button, flip transition, triple-tap gesture detection, hidden state management)
