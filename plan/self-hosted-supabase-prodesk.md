# Plan: Self-hosted Supabase + prodesk deployment

## Goal

Deploy Fugleramme on **prodesk** (homelab, `fjrt@prodesk`) behind the existing
Cloudflare tunnel, with a **self-hosted Supabase** replacing VerdENT at runtime.
Do all work on a new branch so the current Verdent-hosted app is untouched.

Success looks like: `https://birds.rebel.army` serves the PWA, mic audio streams
over `wss://birds.rebel.army/ws/audio`, and BirdNET inference returns detections
that persist in a self-hosted Postgres.

Vercel was considered first and **rejected** — see "Why not Vercel".

## Current state (verified this session, not assumed)

### Frontend is hardwired to same-origin

There is **no API base-URL concept** anywhere in the frontend:

| Location | Construction |
|---|---|
| `src/frontend/src/api/client.ts:12` | `fetch('/api/v1' + path)` — relative |
| `src/frontend/src/ws/audio.ts:252` | `${protocol}//${location.host}/ws/audio?token=` |
| `src/frontend/src/ws/detections.ts:123` | `${protocol}//${location.host}/ws/detections?token=` |
| `src/frontend/src/components/diagnostics.ts:428-429,666` | same, plus doctor report |
| `src/frontend/src/lib/supabase.ts:8-9` | `VITE_SUPABASE_URL ?? window.location.origin` |

The only production-time remote config that exists is the Supabase trio:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VERDENT_OAUTH_INITIATE_URL`.

### Which Supabase features are actually used

| Feature | Used | Evidence |
|---|---|---|
| GoTrue (auth) | yes | `@verdent/auth-js` modal |
| PostgREST (data) | yes | `api/settings.ts`, `api/detections.ts`, `api/species.ts` |
| Postgres + RLS | yes | 9 migrations incl. detections INSERT policy |
| **Realtime** | **no** | no `.channel()` / `postgres_changes` anywhere |
| **Storage** | **no** | artwork is static files in `src/frontend/public/` |
| Edge Functions / Analytics / Vector | no | no usage |

A trimmed stack of **Postgres + GoTrue + PostgREST** is therefore sufficient.
Not the full ten-service compose.

### Auth is owned by a VerdENT SDK

`src/frontend/src/lib/supabase.ts:19` calls `createVerdentAuth()` from
`@verdent/auth-js@0.1.9` (private registry `npm.verdent.app`). Its README states
it takes **an existing Supabase client** and owns Google OAuth, email/password,
sign-up OTP, and password recovery. The app's only call site is
`src/frontend/src/views/login.ts:16` — `auth.openSignInModal()`. No direct
`supabase.auth.signInWithPassword` / `signUp` calls exist.

### Backend constraints

- `src/backend/config.py` — `supabase_url` (`SUPABASE_URL`), `supabase_anon_key`
  (`SUPABASE_ANON_KEY`), `supabase_jwt_secret`, `frontend_dir` (`FRONTEND_DIR`),
  `environment` (`ENVIRONMENT`).
- `src/backend/config.py:47` — `cors_origins` is a **hardcoded list with no env
  override**. Adding an origin requires a code change.
- `src/backend/auth/router.py:110` — `samesite="strict"`, `secure=settings.is_production`.
- `src/backend/ws/audio.py:203` — `origin = f"{scheme}://{websocket.url.netloc}"`.
  This is derived from the **WebSocket URL**, not the browser `Origin` header.
  Consequence: **`SUPABASE_URL` must be set explicitly** or token validation
  calls the wrong host and every socket closes **4001**.

### prodesk

| Fact | Value |
|---|---|
| Host / arch | prodesk, x86_64 Linux |
| Docker | 29.8.1 |
| Cloudflare | `cloudflared --no-autoupdate tunnel run --token-file /etc/cloudflared/token` |
| Tunnel type | **remotely-managed** — no `config.yml` on host; hostname rules live in the CF dashboard |
| Resources | 25 GiB RAM (18 GiB avail), 4 CPU, 606 G free disk |
| Fugleramme present | **no** — `find /home/fjrt -iname "*fugleramme*"` is empty |
| Ports 8080 / 8081 | **taken** (drawio, seaweedfs) |
| Ports 8090 / 9080 / 8099 / 9090 | free → use **8090** |
| Existing containers | seaweedfs, omniroute(+redis), karakeep(web/meilisearch/chrome), drawio |

Because no Fugleramme exists on prodesk, deploying there **cannot** disturb the
Verdent-hosted app.

## Why not Vercel

Splitting frontend (Vercel) from backend (prodesk) forces every request
cross-origin, which breaks three things that all live in files shared with the
Verdent deploy: the hardcoded `location.host` in the two `ws/` modules, the
`SameSite=Strict` cookie, and the hardcoded `cors_origins`. Single-hostname
hosting on prodesk avoids all three and needs **zero frontend code changes** for
routing.

## Target architecture

Single hostname keeps everything same-origin, so no CORS and no cookie changes.

```
browser
  │  https://birds.rebel.army
  ▼
Cloudflare (prodesk tunnel — hostname added in Zero Trust dashboard)
  ▼
caddy / nginx on prodesk
  ├─ /rest/v1/*  ──► PostgREST   (Supabase)
  ├─ /auth/v1/*  ──► GoTrue      (Supabase)
  └─ /*          ──► Fugleramme  :8090  (SPA + /api/v1 + /ws)
```

`/rest/v1` and `/auth/v1` are the standard Supabase paths, so path-prefix
proxying works without rewriting the frontend. Because
`VITE_SUPABASE_URL ?? window.location.origin` already defaults to the page
origin, the frontend needs **no URL changes** — only the publishable key set.

## Implementation

### Phase 0 — Decisions to confirm

- Hostname: `birds.rebel.army` (assumed).
- Port: `8090` (verified free).
- Google OAuth: drop it initially (email/password only). See "Risks".

### Phase 1 — Branch and clone on prodesk

```bash
# local
git checkout -b selfhosted-supabase

# on prodesk — fresh clone, own directory, no existing checkout to disturb
git clone https://github.com/fjrtdk/fugleramme.git ~/fugleramme-selfhosted
cd ~/fugleramme-selfhosted && git checkout selfhosted-supabase
```

### Phase 2 — Self-hosted Supabase, trimmed

Create `infra/` (reserved by `org/binding.md` for Docker/CI/dev scripts; does
not exist yet) containing a compose file with **only**:

- `postgres` — the `supabase/postgres` image, which already ships the
  `auth`, `anon`, `authenticated`, `service_role` roles and the `auth` schema
  that RLS policies depend on. Do **not** use vanilla Postgres: `auth.uid()`
  in the RLS policies requires it.
- `gotrue` — auth server
- `postgrest` — REST layer
- `studio` — **optional**, bind to `127.0.0.1` only, for hand-editing RLS

Skip realtime, storage, imgproxy, kong, analytics, vector, functions. Bind
Postgres and GoTrue to `127.0.0.1` on non-conflicting host ports; nothing but
caddy should reach them.

Note prodesk already runs Postgres on `127.0.0.1:5432` for another stack — the
Supabase instance must use its own port and volume.

### Phase 3 — Apply the existing migrations

The 9 files in `.verdent/supabase/migrations/` are plain SQL and are the source
of truth for schema and RLS. Apply them in filename order with `psql` against
the new instance, then seed `auth.users`-compatible config. No rewriting needed.

Verify RLS specifically — a recent commit (`d37b0a1`) added the missing
`detections` INSERT policy, and RLS is where a self-hosted instance most
often silently diverges from the hosted one.

### Phase 4 — Fix the onboarding bug (do this in the same branch)

`src/frontend/src/views/onboarding.ts` PATCHes `onboarding_seen` through
`patchMe` → `PATCH /api/v1/users/me`, which writes to **legacy SQLite**. The
app reads it from **Supabase `user_metadata`** via `supabaseUserToAppUser`
(`src/frontend/src/lib/supabase.ts:39-51`).

Against a fresh self-hosted instance this fails outright — the SQLite row does
not exist for a Supabase user. Fix it properly: replace `patchMe` with a
Supabase `updateUserById` writing `user_metadata.onboarding_seen`, and drop the
`api/auth.ts` import from `onboarding.ts`. This also removes the last consumer
of the legacy `/api/v1/auth/*` cookie path.

### Phase 5 — Frontend auth config for self-hosted

In `src/frontend/src/lib/supabase.ts:19-24`, `createVerdentAuth` is given an
`oauth.authorizeUrl` when `VITE_VERDENT_OAUTH_INITIATE_URL` is set. With
self-hosted Supabase that broker does not exist — **omit the `oauth` option
entirely**, which the SDK's own README shows as supported
(`createVerdentAuth({ supabase })`).

Build-time env (`.env` on prodesk, or Vercel-style inject — do **not** commit):

```
VITE_SUPABASE_URL=https://birds.rebel.army
VITE_SUPABASE_PUBLISHABLE_KEY=<self-hosted anon JWT>
```

Runtime env for the backend container:

```
SUPABASE_URL=https://birds.rebel.army
SUPABASE_ANON_KEY=<same anon JWT>
JWT_SECRET=<generated, 32+ bytes>
ENVIRONMENT=production
PORT=8090
FRONTEND_DIR=/app/frontend_dist
```

`SUPABASE_URL` is **mandatory** — see the `ws/audio.py:203` note above.

### Phase 6 — Build and run

The existing `Dockerfile` already does the right thing: builds the SPA in a
Node stage, bakes the BirdNET model via `download_model`, copies `dist/` to
`frontend_dist/`, and honours `${PORT}`. Run it on prodesk with the env above.
Linux x86_64 has `ai-edge-litert` wheels, so inference works there — the
Intel-Mac install problem is local-dev-only.

### Phase 7 — Reverse proxy + Cloudflare (user action required)

Add a caddy (or nginx) site on prodesk routing per the architecture diagram,
including WebSocket upgrade headers for `/ws/*`.

Then, **in the Cloudflare Zero Trust dashboard** (cannot be scripted from the
host — the tunnel is token/remotely-managed): add public hostname
`birds.rebel.army` → `http://localhost:8090`. Leave `lab.rebel.army` untouched.

## Verification

Run in order; each step is a real check, not a smoke test.

1. **Supabase up:** `docker compose -f infra/supabase.yml ps` — db, gotrue,
   postgrest healthy.
2. **Schema applied:** `psql -c '\dt'` shows the app tables; confirm the
   `detections` INSERT RLS policy exists.
3. **Backend up:** `curl -s localhost:8090/health` → `{"status":"ok","birdnet":true}`.
   `birdnet:true` is the assertion that the model loaded on Linux.
4. **SPA served:** `curl -sI localhost:8090/` → 200 and `text/html`.
5. **Proxy:** `curl -sI https://birds.rebel.army/health` → 200 through Cloudflare.
6. **Auth end-to-end:** load the page, sign up with email/password, confirm a
   session lands in localStorage and `supabaseUserToAppUser` maps the user.
7. **WebSocket upgrade:** open `wss://birds.rebel.army/ws/audio?token=<jwt>` and
   confirm it **stays open**. A `4001` means `SUPABASE_URL` is unset or wrong —
   this is the single most likely failure and the reason it is called out above.
8. **Inference:** grant mic permission, confirm a 3-second window produces a
   detection, and that it appears in Postgres (proves the full loop including
   `_save_detection_to_supabase` and RLS).
9. **Onboarding:** complete onboarding, reload, confirm it does not reappear
   (validates the Phase 4 fix).
10. **Regression:** `uv run pytest tests/` on the branch.

Local cross-check on the Mac, where inference cannot run (no `ai-edge-litert`
x86_64 wheel, no model): use `uv run --no-sync uvicorn src.backend.main:app
--reload --port 8080` and confirm the UI renders and auth works against the
self-hosted Supabase.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `SUPABASE_URL` unset/wrong | every socket closes 4001 | set explicitly; verify at step 7 |
| RLS diverges from hosted | silent empty results | verify INSERT policy at steps 2 and 8 |
| Google OAuth unavailable | modal's Google entry may error | start email/password-only; add a GoTrue Google provider later |
| `@verdent/auth-js` private registry | build fails off-network if not cached | `npm ci` needs `.npmrc` with `@verdent:registry`; confirm access on prodesk |
| 4 shared CPUs | inference latency under load | monitor; BirdNET runs every 3 s |
| No backups | data loss | schedule `pg_dump` before real use |
| Cloudflare dashboard step | blocks go-live | do it early; cannot be automated |
| Security-sensitive auth service | you own patching | pin versions, restrict Postgres/GoTrue to loopback |

## Out of scope

- The `CLAUDE.md` staleness found this session (frontend port 5173 → **3000**,
  backend 8000 → **8080**, and `contracts/security.md` / `contracts/tokens/`
  now exist though `CLAUDE.md` says they don't). Worth a separate correction.
- The leaked `</think>` in the `tests/test_websocket.py` graft summary.
- Multi-user hardening and the onboarding SQLite cleanup beyond Phase 4.
