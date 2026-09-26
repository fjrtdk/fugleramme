# spec/index.md — Fugleramme Story Index

All approved user stories for the Fugleramme PWA. Each story is a discrete unit of work.
The dispatch order below reflects the dependency chain: contracts and content must land before implementation.

## Recommended dispatch order

```
1. @Contract  ← read all stories, write contracts/ (API, WebSocket, user schema, tokens,
               settings entity — US-010 settings API must land before US-008/US-009/US-010 @Web work)
2. @Design    ← read stories US-004, US-003, US-008, US-009 for aesthetic/token direction
               (fade tokens for US-008; emphasis treatment tokens for US-009)
3. @Content   ← bird illustrations, body-mass data, app icons
4. @Data      ← SQLite migrations for user entity (US-001, US-002 flags, US-010 settings fields)
5. @Backend   ← US-001 (auth logic), US-006 (detection engine), US-010 (settings persistence)
6. @Web       ← US-001 (auth UI), US-002, US-003, US-004, US-005, US-007 (PWA),
               US-008 (latest bird), US-009 (newest arrival), US-010 (settings panel)
7. @Security  ← audit auth, WebSocket handshake, session policy, settings API exposure
8. @QA        ← tests for all of the above
9. @Docs      ← after behaviour is implemented and verified
10. @Compliance ← before any merge to main
```

## Story table

| ID | Title | Owner(s) | Preconditions |
|---|---|---|---|
| [US-001](./US-001-auth.md) | Auth & Registration | `@Backend`, `@Web` | Contract: auth endpoints + JWT shape |
| [US-002](./US-002-onboarding.md) | Welcome & Onboarding | `@Web` | Contract: `onboarding_seen` field on user entity |
| [US-003](./US-003-dashboard-flip.md) | Dashboard & Display Flip | `@Web` | Contract: display route/state shape |
| [US-004](./US-004-fugleramme-display.md) | Fugleramme Display | `@Web` | Contract: detection WS message shape; Content: illustrations + body-mass data |
| [US-005](./US-005-audio-capture.md) | Audio Capture | `@Web` | Contract: audio WS endpoint, binary frame format, auth handshake |
| [US-006](./US-006-detection-engine.md) | Backend Detection Engine | `@Backend` | Contract: WS message schemas; Content: illustration naming convention |
| [US-007](./US-007-pwa.md) | PWA Installability & Offline Shell | `@Web` | Content: app icons (192×192, 512×512 PNG); Infra: HTTPS + correct SW headers |
| [US-008](./US-008-latest-bird.md) | Latest Bird Display Mode | `@Web` | Contract: detection WS message shape (US-004); Contract: display-mode field on settings entity (US-010); Design: fade transition tokens |
| [US-009](./US-009-newest-arrival.md) | Newest Arrival Display Mode | `@Web` | Contract: settings entity (US-010) for lookback window and display-mode fields; Design: emphasis treatment tokens |
| [US-010](./US-010-dashboard-settings.md) | Dashboard Display Settings | `@Contract`, `@Backend`, `@Web` | Story approved. `@Contract` lands first; `@Backend` and `@Web` implement in parallel after contract is written |

## Explicit non-goals (project-level)

The following are out of scope for all stories in this phase and must not be implemented:

- Android native companion app
- iOS native app
- Cloud API keys or external ML services (all inference is local)
- User-to-user social features
- BirdNET model training or fine-tuning
- E-ink / low-refresh-rate display mode
- Separate admin panel surface (admin lives in the dashboard)

## Stories not yet written

None. All requirements from the initial brief are covered by the ten stories above.
