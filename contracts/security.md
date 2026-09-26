# contracts/security.md — Fugleramme Security Policy

**Author:** @Security  
**Audit date:** 2026-09-26  
**Scope:** Full codebase audit across all 8 areas listed in the task card.  
**Write scope:** This file only. No product code was modified.

---

## Summary

Fugleramme has a competent security baseline for a local PWA. The authentication
stack (bcrypt, HS256 JWT, httpOnly+SameSite=Strict cookie, parameterised SQL) is
correctly implemented. User data isolation is enforced consistently. The main
risks are operational: a missing `.gitignore` means the auto-generated JWT secret
file could be committed to version control; there is no rate limiting on login;
logout does not invalidate the issued JWT; and there is no account deletion
endpoint, which is a GDPR blocker for any EU deployment.

Seven findings are **Critical or High**. They must be resolved before a production
deployment that accepts real user accounts. The remaining findings are
acceptable for a v1 local deployment but should be tracked.

---

## Findings Table

| # | Severity | Area | Description | Location | Recommendation |
|---|---|---|---|---|---|
| F-01 | **Critical** | Secrets | `.jwt_secret` file exists on disk and there is **no `.gitignore`** in the project root. Any `git add .` or IDE auto-commit will include the live secret in version control. | `/Users/fjrt/workspace/Fugleramme/.jwt_secret` (file present); no `.gitignore` found at repo root | Add `.gitignore` immediately. Entries must include `.jwt_secret`, `*.db`, `fugleramme.db`, `__pycache__/`, `.env*`. After adding `.gitignore`, rotate the secret. |
| F-02 | **High** | Authentication | **No rate limiting on auth endpoints.** `POST /auth/login` and `POST /auth/register` accept unlimited requests. An attacker can enumerate passwords at CPU-limited bcrypt speed without any throttle. | `src/backend/auth/router.py` | Add per-IP and per-email rate limiting via `slowapi` or a reverse-proxy rule. Recommended: max 10 login attempts per email per 15 minutes, with exponential backoff after 5. |
| F-03 | **High** | Authentication | **Logout does not invalidate the issued JWT.** `POST /auth/logout` clears the cookie but the JWT remains cryptographically valid until its 24-hour `exp`. A stolen or intercepted token continues to work after logout. | `src/backend/auth/router.py:232–238` | Maintain a server-side blocklist (a `revoked_tokens` table keyed by `jti` claim + `exp`). On logout, insert the current `jti`. On every token decode, check the blocklist. Alternatively, shorten JWT expiry (e.g. 15 min) and introduce a separate long-lived refresh token stored only in the httpOnly cookie. |
| F-04 | **High** | Authorization | **WebSocket auth happens post-accept.** Both `/ws/audio` and `/ws/detections` call `await websocket.accept()` before validating the token, then close with code 4001 on failure. The TCP+WS handshake is paid for every invalid connection — this is an amplification vector for connection exhaustion and is inconsistent with the contract's stated "upgrade rejected with HTTP 401". | `src/backend/ws/audio.py:163–178`; `src/backend/ws/detections_ws.py:23–38` | Use Starlette's `WebSocket.headers` or an HTTP middleware to validate the `?token=` query parameter before accepting the connection. FastAPI supports returning HTTP 401 during the upgrade phase by not calling `accept()` and raising `HTTPException`. |
| F-05 | **High** | Data minimization | **No account deletion endpoint.** Users cannot delete their accounts or associated detection data. GDPR Article 17 (right to erasure) requires this for any service accessible to EU residents. | No `DELETE /users/me` or equivalent anywhere in `src/backend/` | Implement `DELETE /api/v1/users/me` requiring password confirmation. The `users` table already cascades deletes to `detections` and `user_settings` via `ON DELETE CASCADE`. |
| F-06 | **High** | Secrets | **JWT secret falls back to a `.jwt_secret` file that may not survive container/serverless restarts.** If the file is absent and `JWT_SECRET` env var is also unset, a new secret is generated silently, invalidating all active sessions. | `src/backend/config.py:9–23` | In production, require `JWT_SECRET` to be set via environment variable and fail-fast if it is absent (`raise RuntimeError`). Remove or disable the file-fallback path in production via an `is_production` guard. |
| F-07 | **High** | WebSocket security | **No per-user WebSocket connection limit.** The `_ConnectionManager` registers an unbounded list of connections per `user_id`. A single authenticated user (or a leaked token) can open thousands of connections, exhausting file descriptors and memory. | `src/backend/ws/manager.py:11–37` | Enforce a per-user connection cap (suggested: 10 concurrent connections). Reject the 11th connection with close code 4008 (Policy Violation) and an error message. |
| F-08 | **Medium** | Frontend security | **JWT returned in HTTP response body** (`"token"` field in `/auth/login` and `/auth/register` responses). This token is stored in JavaScript memory (`state.ts`) and appended to WebSocket URLs. Any XSS vulnerability in the page would expose the token. The httpOnly cookie is the correct auth channel for HTTP; the in-memory token is a necessary concession for WebSocket auth. | `src/backend/auth/router.py:180–189, 220–229`; `src/frontend/src/state.ts` | This is an accepted trade-off for WS auth. Mitigate by: (1) minimising the JWT TTL (see F-03), (2) adding a strict Content-Security-Policy (see F-10), (3) scoping the in-memory token to be used only for WS URL construction and never written to any storage API. Current `state.ts` implementation is correct on point 3. |
| F-09 | **Medium** | WebSocket security | **JWT in WebSocket query parameter.** `?token=eyJ...` appears in the full request URL. While `request_logging_middleware` logs only `request.url.path` (no query string), a reverse proxy, CDN, or load balancer that logs full URLs would capture the token. | `src/frontend/src/ws/audio.ts:113`; `src/frontend/src/ws/detections.ts:41` | This is a WebSocket limitation (no custom request headers in the browser WS API). Mitigate by: (a) ensuring all production proxies are configured to strip or redact query parameters from logs, and (b) using short-lived WS-specific tickets (issue a single-use `ws_ticket` from a REST endpoint, exchange it for a session on first WS message) if the threat model requires it. |
| F-10 | **Medium** | Frontend security | **No Content-Security-Policy header.** The server does not set a `Content-Security-Policy` response header. Without CSP, any injected script can access the in-memory JWT (see F-08) and exfiltrate it. | `src/backend/main.py` (no CSP middleware) | Add a CSP header via Starlette middleware or a reverse proxy. Minimum: `default-src 'self'; connect-src 'self' wss:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'`. |
| F-11 | **Medium** | Authentication | **CORS uses wildcard method and header lists.** `allow_methods=["*"]` and `allow_headers=["*"]` are overly permissive. Combined with `allow_credentials=True`, this broadens the CORS attack surface unnecessarily. | `src/backend/main.py:68–74` | Restrict to actual used methods (`GET`, `POST`, `PATCH`, `PUT`, `DELETE`, `OPTIONS`) and headers (`Content-Type`, `Authorization`, `Cookie`). |
| F-12 | **Medium** | Authentication | **No production CORS origins configured.** `cors_origins` lists only `localhost` and `127.0.0.1` variants. A production deployment with a real domain would fail CORS unless this is updated — but more critically, if an operator forgets to set it, a wildcard fallback might be introduced. | `src/backend/config.py:31–38` | Add `CORS_ORIGINS` as an environment variable, parsed as a comma-separated list. Fail-fast in production if it contains only `localhost` origins. |
| F-13 | **Medium** | Dependencies | **`python-jose` has a historical algorithm confusion CVE** (CVE-2022-29217). The current code mitigates this by passing `algorithms=["HS256"]` explicitly in `decode_token`. However, `python-jose` is no longer actively maintained (last release 2022). | `src/backend/auth/jwt_utils.py:25–29`; `pyproject.toml` | Consider migrating to `python-jose`'s maintained fork (`joserfc`) or `PyJWT`. The fix is a drop-in rename. The current code is not vulnerable due to explicit algorithm pinning, but the library maintenance status is a supply-chain risk. |
| F-14 | **Medium** | Authorization | **WebSocket handlers do not verify the user exists in the database.** The token's `sub` claim is trusted entirely. A JWT for a deleted user (if account deletion is implemented — see F-05) would still authenticate successfully on the WS endpoints. | `src/backend/ws/audio.py:169–177`; `src/backend/ws/detections_ws.py:26–38` | After token decode, perform a fast `SELECT 1 FROM users WHERE id = ?` check and close with 4001 if the user no longer exists. The HTTP endpoints already do this correctly in `GET /auth/me`. |
| F-15 | **Low** | WebSocket security | **`/ws/detections` receive loop is unguarded.** The server reads and discards client messages in a tight `receive_text()` loop. A client that rapidly sends large text frames (up to Starlette's default 65535-byte limit) can consume CPU and memory without consequence. | `src/backend/ws/detections_ws.py:41–44` | Close the connection with code 1008 (Policy Violation) if any client message is received, or add a frame-size guard. Document in `contracts/websocket.md` that clients MUST NOT send messages on this channel. |
| F-16 | **Low** | Data minimization | **No detection data retention policy or purge mechanism.** Detections accumulate indefinitely. For a local always-on deployment this will grow unbounded. | `src/backend/database.py` (no TTL/purge logic) | Add a configurable retention window (e.g. `DETECTION_RETENTION_DAYS`, default 90). Implement a background task (or a DELETE query triggered on startup) to purge rows older than the window. Document the policy. |
| F-17 | **Low** | Dependencies | **No automated dependency vulnerability scanning in CI.** There is no `pip-audit`, `safety`, or `npm audit` step in the CI pipeline. | `infra/` (no audit step observed) | Add `uv run pip-audit` and `npm audit --audit-level=high` as blocking CI steps. |
| F-18 | **Low** | Authentication | **`/auth/refresh` issues a new access token from the same expiring token.** If the token is within its 24-hour window, refresh succeeds. There is no sliding window — a user who refreshes 23 hours in gets another 24-hour token. Without a blocklist (F-03), this effectively grants indefinite sessions for active users, which means a compromised token can be kept alive indefinitely. | `src/backend/auth/router.py:240–247` | This becomes safe once F-03 is resolved (blocklist or short TTL+refresh token). Until then, document that refresh does not extend beyond the original expiry (i.e., add a `max_age` claim and enforce it). |
| F-19 | **Info** | Authentication | **Email enumeration at registration is intentional.** `POST /auth/register` returns HTTP 409 with `EMAIL_ALREADY_EXISTS`. This deliberately reveals whether an email is registered. | `src/backend/auth/router.py:138–148`; `contracts/api.md` | Accepted. The 409 response is consistent with the contract and provides better UX than a silent failure. No action required if this is intentional product behaviour. |
| F-20 | **Info** | Authentication | **`Secure` cookie flag is off in development.** `secure=settings.is_production` means in local dev the session cookie travels over plain HTTP. | `src/backend/auth/router.py:105–113` | Accepted. This is the correct and intentional behaviour. The `is_production` guard is the right mechanism. Ensure `ENVIRONMENT=production` is set in all non-local deployments. |
| F-21 | **Info** | Frontend | **`ScriptProcessorNode` is deprecated.** The audio pipeline uses the deprecated Web Audio API `createScriptProcessor`. Not a security issue; a functional/compatibility issue. | `src/frontend/src/ws/audio.ts:53` | Migrate to `AudioWorklet` before the browser vendor removes `ScriptProcessorNode`. Outside security scope; flag to `@Web`. |

---

## Coverage by Audit Area

| Area | Finding(s) | Verdict |
|---|---|---|
| 1. JWT / Authentication | F-02, F-03, F-06, F-13, F-18, F-19, F-20 | Critical gaps: rate limiting absent, logout does not revoke token, production secret management fragile. Implementation details (bcrypt rounds, algorithm pinning, cookie attributes) are correct. |
| 2. Authorization / user isolation | F-04, F-05, F-14 | User isolation enforced correctly in all HTTP endpoints. WS post-accept auth is a policy gap. No account deletion is a GDPR blocker. |
| 3. WebSocket security | F-04, F-07, F-09, F-15 | Frame-size validation present. Origin validation absent (mitigated by SameSite=Strict on cookie, less relevant for token-in-URL approach). Connection limits absent. |
| 4. Audio / mic permissions | — | Mic permission denial is handled. Raw audio is not persisted. Audio data does not leak outside the WS processing pipeline. No findings. |
| 5. Secrets management | F-01, F-06 | `.jwt_secret` on disk with no `.gitignore` is the single most urgent operational risk. Secret generation quality is good (256-bit). |
| 6. Data minimization / PII | F-05, F-16 | Minimal PII collected (email + password hash). No deletion endpoint. No retention policy. |
| 7. Frontend security | F-08, F-10, F-11, F-12 | JWT in memory only (correct). No CSP. CORS method/header lists overly broad. No production origins configured. |
| 8. Dependencies | F-13, F-17 | `python-jose` maintenance risk (mitigated). No automated scanning. |

---

## Remediation Priorities

### Must fix before shipping to real users

These findings present material risk of data loss, account compromise, or legal
non-compliance in any deployment that accepts real accounts.

| Priority | Finding | Why it is blocking |
|---|---|---|
| P0 | **F-01** — Add `.gitignore`, rotate secret | JWT secret in version control is an irreversible compromise |
| P0 | **F-02** — Rate limiting on login | Brute-force with no throttle is a textbook account-takeover vector |
| P0 | **F-05** — Account deletion endpoint | GDPR Article 17 compliance blocker for EU deployment |
| P1 | **F-03** — JWT blocklist on logout | Active tokens surviving logout undermines session termination |
| P1 | **F-06** — Fail-fast on missing JWT_SECRET in production | Silent secret rotation on restart invalidates all sessions |
| P1 | **F-04** — Reject WS before accept on bad token | Contract says 401 at upgrade; current implementation says 4001 post-accept |

### Acceptable for v1 local deployment, fix before public release

| Priority | Finding | Effort |
|---|---|---|
| P2 | **F-07** — Per-user WS connection cap | Small: add a counter in `_ConnectionManager` |
| P2 | **F-10** — CSP header | Small: add Starlette middleware |
| P2 | **F-11** — CORS method/header restriction | Trivial config change |
| P2 | **F-12** — Production CORS origins via env var | Small config change |
| P3 | **F-08** — JWT in response body (WS auth trade-off) | Mitigated by F-03 + F-10; full resolution requires WS ticket endpoint |
| P3 | **F-09** — Token in WS query param | Mitigated by proxy log redaction; full resolution requires WS ticket endpoint |
| P3 | **F-13** — Migrate from `python-jose` | Low urgency; currently mitigated by explicit algorithm list |
| P3 | **F-14** — WS user-existence DB check | Add one `SELECT 1` query in both WS handlers |
| P3 | **F-15** — `detections_ws` receive guard | Close on unexpected client message |
| P3 | **F-16** — Detection retention policy | Add configurable purge task |
| P3 | **F-17** — Dependency scanning in CI | Add `pip-audit` and `npm audit` steps |
| P3 | **F-18** — Refresh token max-age | Resolved when F-03 is implemented |

---

## Non-negotiables re-stated (Charter §10 cross-reference)

- **Secrets never enter code, logs, fixtures, or docs.** F-01 is a violation of this rule in
  the current state of the repository (no `.gitignore`). Fix before any first commit.
- **Minimise personal data.** F-05 and F-16 are the outstanding gaps.
- **Auth/PII changes require @Security sign-off.** Any implementation that touches F-01
  through F-07 must be reviewed by @Security before merge.
