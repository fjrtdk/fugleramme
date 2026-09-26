# US-007 — PWA Installability & Offline Shell

## User story

As a user on any device, I want to install Fugleramme as a Progressive Web App and have the app shell load instantly even when the network is slow, so that it feels like a native app and the display is always ready.

## Acceptance criteria

1. The app includes a valid Web App Manifest (`manifest.json`) with: `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, and at least two icon sizes (192×192 and 512×512 px, PNG).
2. The manifest is linked from the HTML `<head>` so that browsers detect it for install prompts.
3. A service worker is registered on app load. The service worker caches the app shell (HTML entry point, bundled JS, bundled CSS, fonts, and the empty-state perch illustration) using a cache-first strategy.
4. After the first load, the app shell (login screen, dashboard, onboarding screen, and empty display canvas) loads and renders without any network request. Dynamic API and WebSocket calls still require connectivity.
5. On Android Chrome and compatible browsers, the "Add to Home Screen" install prompt is not suppressed; the browser's native install UI is allowed to appear.
6. On iOS Safari, the app can be added to the Home Screen via the share sheet; the manifest `display: standalone` hides the browser chrome when launched from the Home Screen.
7. The installed app icon uses the artwork supplied in `assets/artwork/` (or a dedicated app icon from `@Content`) and is legible at 192×192 and 512×512 px.
8. The app is responsive at every breakpoint from 320 px width (phone portrait) through 768 px (tablet portrait) through 1280 px (desktop).
9. The service worker does not cache API responses, WebSocket traffic, or audio data — only the static app shell.
10. A new version of the app shell prompts the service worker to update; the next time the user opens the app (or refreshes), the updated shell is served. No manual cache-busting step is required from the user.
11. The Lighthouse PWA audit (run against the production build) passes all "Installable" checks and all "PWA Optimized" checks.

## Non-goals

- Full offline detection capability (BirdNET inference requires the backend; offline detection is not in scope).
- Background sync or push notifications (deferred).
- iOS standalone splash screen customisation beyond what the manifest supports natively.
- Android native APK or TWA packaging.
- Cache-first strategy for API data or detection results.

## Owner

`@Web` (manifest, service worker, shell caching strategy, responsive breakpoints, Lighthouse compliance)

> **Note to Manager:** `@Content` must supply the app icon assets (192×192 and 512×512 PNG) before `@Web` can complete AC 1 and 7. `@Infra` must ensure the production build serves the service worker with the correct `Service-Worker-Allowed` header and that the app is served over HTTPS (required for service worker registration).
