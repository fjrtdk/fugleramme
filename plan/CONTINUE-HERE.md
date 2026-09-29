# CONTINUE HERE — self-hosted Fugleramme deployment

**Written so the work can continue on prodesk without the iMac.** Everything
needed is in this repo; the iMac is no longer a dependency.

- Source on prodesk: `~/fugleramme-selfhosted`, branch `selfhosted-supabase`
- Remote: `https://github.com/fjrtdk/fugleramme.git`
- Full design: `plan/self-hosted-supabase-prodesk.md`
- Machine notes for Wolfie: `plan/prodesk-handoff-wolfie.md`

---

## State as of `4df6ee1`

| Commit | What |
|---|---|
| `d37b0a1` | base (main) — detections INSERT RLS policy |
| `e52af5d` | the two plan documents |
| `4df6ee1` | onboarding fix + contract corrections |

**Done**

- Network issue diagnosed and fixed (WAN MSS clamp) — prodesk and iMac both clone fine
- prodesk probed: ports, RAM/CPU/disk, running containers, tunnel type
- Source cloned, branch created and pushed
- `onboarding_seen` now persists via Supabase only; dead SQLite write removed
- Contracts corrected first per the ordering rule (`contracts/api.md`, `contracts/schema.md`)

**Not done — this is the remaining work**

- Self-hosted Supabase has not been created
- No container built or running
- No reverse proxy configured
- Cloudflare hostname not added (needs the Zero Trust dashboard)
- Nothing is deployed or reachable

---

## Target shape

```
browser
  │ https://birds.rebel.army
  ▼
Cloudflare tunnel (already running on prodesk)
  ▼
reverse proxy on prodesk
  ├─ /rest/v1/* ──► PostgREST
  ├─ /auth/v1/* ──► GoTrue
  └─ /*         ──► Fugleramme :8090
```

One hostname keeps everything **same-origin**. That is deliberate: the frontend
hardcodes `${location.host}` in `src/frontend/src/ws/audio.ts:252` and
`src/frontend/src/ws/detections.ts:123`, the session cookie is
`SameSite=Strict` (`src/backend/auth/router.py:110`), and `cors_origins` is a
hardcoded list with no env override (`src/backend/config.py:47`). A single
origin means none of those need changing.

---

## Step 1 — Pull latest (prodesk is at e52af5d, needs 4df6ee1)

```bash
cd ~/fugleramme-selfhosted
git pull origin selfhosted-supabase
git log --oneline -1     # expect 4df6ee1
```

## Step 2 — Create `infra/` (trimmed Supabase)

`org/binding.md` reserves `infra/` for "Docker, CI config, dev scripts" and it
does not exist yet. Create `infra/supabase.yml` with **only**:

- `postgres` — use the `supabase/postgres` image, **not** vanilla `postgres`.
  RLS policies call `auth.uid()`, which only exists in that image. With vanilla
  Postgres the policies fail to resolve and queries return empty **without
  erroring**.
- `gotrue`
- `postgrest`
- `studio` — optional, bind `127.0.0.1` only, handy for hand-editing RLS

Skip realtime, storage, imgproxy, kong, analytics, vector, functions — the app
uses none of them (no `.channel()` anywhere; artwork is static files in
`src/frontend/public/`).

Bind Postgres and GoTrue to `127.0.0.1` on unused host ports. **Note: prodesk
already runs Postgres on `127.0.0.1:5432` for another stack** — use different
ports and a separate volume.

## Step 3 — Apply the existing schema

The 9 files in `.verdent/supabase/migrations/` are plain SQL and are the source
of truth. Apply in filename order with `psql`. Verify the `detections` **INSERT**
RLS policy exists — that was the subject of `d37b0a1` and is the most likely
thing to diverge.

## Step 4 — Reverse proxy

Route per the diagram above, with WebSocket upgrade headers for `/ws/*`.
Fugleramme listens on **8090**.

## Step 5 — Cloudflare dashboard (human action)

The tunnel is remotely-managed:

```
cloudflared --no-autoupdate tunnel run --token-file /etc/cloudflared/token
```

No `config.yml` on the host, so this **cannot** be scripted from the machine.
Add public hostname `birds.rebel.army` → `http://localhost:8090` in the
Zero Trust dashboard. **Do not disturb `lab.rebel.army`.**

## Step 6 — Environment

Build-time (frontend, must not be committed):

```
VITE_SUPABASE_URL=https://birds.rebel.army
VITE_SUPABASE_PUBLISHABLE_KEY=<self-hosted anon JWT>
```

Runtime (backend container):

```
SUPABASE_URL=https://birds.rebel.army     # REQUIRED - see below
SUPABASE_ANON_KEY=<same anon JWT>
JWT_SECRET=<generated 32+ bytes>
ENVIRONMENT=production
PORT=8090
FRONTEND_DIR=/app/frontend_dist
```

`SUPABASE_URL` is **not optional**. `src/backend/ws/audio.py:203` derives the
origin from the WebSocket URL itself (`websocket.url.netloc`), not the browser's
`Origin` header. If it is unset, token validation calls the wrong host and every
socket closes with **4001**. This is the single most likely failure — check it
first when debugging.

Also edit `src/frontend/src/lib/supabase.ts:19-24` to omit the `oauth` option
from `createVerdentAuth` — that broker is VerdENT-specific and does not exist
against self-hosted Supabase. Email/password then works via the SDK's modal,
which is the only auth entry point (`views/login.ts:16`).

## Step 7 — Build and run

The existing `Dockerfile` already does the right thing: builds the SPA in a Node
stage, bakes the BirdNET model via `download_model`, copies `dist/` to
`frontend_dist/`, honours `${PORT}`. Linux x86_64 has `ai-edge-litert` wheels,
so inference works on prodesk.

---

## Verification

1. `docker compose -f infra/supabase.yml ps` — db/gotrue/postgrest healthy
2. `psql -c '\dt'` — app tables present, `detections` INSERT policy exists
3. `curl -s localhost:8090/health` → `{"status":"ok","birdnet":true}`
   — `birdnet:true` is the assertion that the model loaded
4. `curl -sI https://birds.rebel.army/health` → 200 through Cloudflare
5. Load the page, sign up with email/password, confirm a session
6. Open `wss://birds.rebel.army/ws/audio?token=<jwt>` and confirm it **stays
   open** — a `4001` means `SUPABASE_URL` is wrong (Step 6)
7. Grant mic, wait ~3 s, confirm a detection appears — proves the full loop
   including `_save_detection_to_supabase` and RLS
8. Complete onboarding, reload, confirm it does not reappear
9. `uv run pytest tests/`

---

## Ports

| Port | Status |
|---|---|
| 8080 | **taken** — drawio |
| 8081 | **taken** — seaweedfs |
| 8090 | free — **use for Fugleramme** |
| 9080, 8099, 9090 | free — spares for the three Supabase services (bind to loopback) |

## Gotchas found the hard way

- **Vite proxies to 8080, not 5173.** `vite.config.ts` sends `/api`, `/ws`,
  `/health`, `/assets` to `http://localhost:8080`. Running the backend on the
  default 8000 leaves the app silently unable to reach it. Port 3000 is the vite
  dev port.
- **`npm.verdent.app` is reachable from prodesk** (HTTP 404 at root is expected
  for a bare registry), so `npm ci` for `@verdent/auth-js` will not fail on
  network.
- **Full clone is 1.5 GB**; `--depth 1` is 381 MB. Use shallow for a deployment
  target.
- **On the iMac only**, `ai-edge-litert` has no `macosx_x86_64` wheel, so
  `uv sync` fails. Work around locally with
  `uv run --no-sync uvicorn src.backend.main:app --reload --port 8080`.
  Inference is impossible on Intel macOS. This does **not** affect prodesk.

## Optional follow-ups

- `src/frontend/src/api/auth.ts` now has **no importers** — safe to delete
- `CLAUDE.md` is untracked locally; its corrections (ports, onboarding, contract
  files) are not in git yet
- The test-suite was not run after the onboarding change; only `tsc --noEmit`
  passed
