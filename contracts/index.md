# contracts/index.md — Fugleramme Contract Index

All contract files are in `contracts/`. This index is the entry point for any agent consuming contracts.

**Version:** v1  
**Status:** complete for the current phase (US-001 through US-010)

---

## Contract files

| File | Summary |
|---|---|
| [`contracts/api.md`](./api.md) | REST API: all HTTP endpoints (`/api/v1/auth/*`, `/api/v1/users/me`, `/api/v1/detections`, `/api/v1/species`, `/api/v1/settings`, `/health`) with request/response shapes, error envelopes, status codes, pagination, and JWT structure |
| [`contracts/websocket.md`](./websocket.md) | WebSocket protocol: audio upstream channel (`/ws/audio`, binary PCM frames, detection result messages) and detection downstream channel (`/ws/detections`, push-only detection and settings events), including auth, message shapes, close codes, and reconnection policy |
| [`contracts/schema.md`](./schema.md) | SQLite schema: `users`, `detections`, `species`, and `user_settings` tables with column types, constraints, indices, entity relationships, SQLite pragma requirements, and illustration file-naming convention |
| [`contracts/tokens/`](./tokens/) | Design tokens (typography, colour, spacing, motion). Written by `@Design`. Not yet created. |
| [`contracts/security.md`](./security.md) | Security policy (auth policy, secret handling, session rules, PII constraints). Written by `@Security`. Not yet created. |

---

## Preconditions satisfied by these contracts

| Story | Precondition | Satisfied by |
|---|---|---|
| US-001 | Auth endpoints + JWT shape | `contracts/api.md` §Auth Endpoints, §JWT Shape |
| US-002 | `onboarding_seen` field on user entity | `contracts/api.md` §User Endpoints, `contracts/schema.md` §users |
| US-003 | Display route/state shape | `contracts/api.md` (no dedicated endpoint; display state is client-only in v1) |
| US-004 | Detection WS message shape | `contracts/websocket.md` §Channel 2 |
| US-005 | Audio WS endpoint, binary frame format, auth handshake | `contracts/websocket.md` §Channel 1 |
| US-006 | WS message schemas, illustration naming convention | `contracts/websocket.md` §Channel 1, `contracts/schema.md` §Illustration File-Naming Convention |
| US-007 | No API contract dependency; PWA-only | — |
| US-008 | Display mode field on settings entity, detection WS message shape | `contracts/api.md` §Settings Endpoints, `contracts/schema.md` §user_settings, `contracts/websocket.md` §Channel 2 |
| US-009 | Display mode + lookback window on settings entity, novelty fallback rule | `contracts/api.md` §Settings Endpoints, `contracts/schema.md` §user_settings, `contracts/websocket.md` §Channel 2 |
| US-010 | Settings API endpoints, settings schema, settings_changed WS event | `contracts/api.md` §Settings Endpoints, `contracts/schema.md` §user_settings, `contracts/websocket.md` §Channel 2 — `settings_changed` message |

---

## What is NOT in these contracts

- Design tokens (typography, colour palette, spacing, motion) — owned by `@Design`, written to `contracts/tokens/`.
- Security policy (session lifetimes, rate limits, secret rotation) — owned by `@Security`, written to `contracts/security.md`.
- BirdNET model format, version, or inference configuration — not a contract; owned by `@Backend` internally.
- Frontend routing table — not a contract; owned by `@Web` internally.
