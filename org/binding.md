# org/binding.md — Fugleramme

Bound once at project start per Charter §2. This binding is authoritative; if the
repository structure and this file disagree, this file wins until amended.

**Project:** Fugleramme — full-stack monolithic PWA for local birdsong detection.
Python backend (FastAPI + BirdNET TFLite), TypeScript/JS frontend (PWA), SQLite
persistence, WebSockets for audio streaming and detection push. No cloud API keys,
fully local. Repository is greenfield (only `.git` exists at binding time).

## Resolved directory map

| Path | Purpose |
|---|---|
| `src/backend/` | Python FastAPI backend |
| `src/frontend/` | TypeScript PWA frontend |
| `assets/artwork/` | Bird illustrations, bundled |
| `assets/fonts/` | Fonts, bundled |
| `migrations/` | SQLite migrations |
| `tests/` | Test suite |
| `docs/` | Documentation |
| `contracts/` | API, WebSocket, schema, tokens, security policy |
| `spec/` | User stories |
| `board/` | Verdicts, compliance blocks |
| `infra/` | Docker, CI config, dev scripts |
| `org/` | This binding |

## Role binding table

| Role | Status | Read paths | Write paths | Model | Build command | Test command |
|---|---|---|---|---|---|---|
| `@Spec` | active | `spec/`, prior conversation intent | `spec/` | `claude-sonnet-4-6` | — | — |
| `@Scope` | active | queue/task cards, `spec/` | `board/` (verdicts only) | `claude-haiku-4-5` | — | — |
| `@Contract` | active | `spec/` | `contracts/` | `claude-sonnet-4-6` | — | — |
| `@Design` | active | `spec/` (UX stories) | `contracts/tokens/` | `claude-sonnet-4-6` | — | — |
| `@Backend` | active | `contracts/` | `src/backend/` | `claude-sonnet-4-6` | `uv sync && uv run uvicorn src.backend.main:app` | `uv run pytest tests/` |
| `@Data` | active | `contracts/` (schema section) | `migrations/` | `claude-sonnet-4-6` | — | `uv run pytest tests/` (migration tests) |
| `@Infra` | active | all build/deploy config | `infra/` | `claude-haiku-4-5` | (defines the above commands) | — |
| `@Pipeline` | inactive | — | — | — | — | — |
| `@Content` | active | content spec in `spec/` | `assets/artwork/`, `assets/fonts/` | `claude-sonnet-4-6` | — | — |
| `@Web` | active | `contracts/`, `contracts/tokens/` | `src/frontend/` | `claude-sonnet-4-6` | `npm install && npm run dev` (from `src/frontend/`) | `npm test` (from `src/frontend/`) |
| `@Admin` | inactive | — | — | — | — | — |
| `@Mobile` | inactive | — | — | — | — | — |
| `@Security` | active | all source | `contracts/` (security policy section only) | `claude-sonnet-4-6` | — | — |
| `@Compliance` | active | manifests, licence files, `assets/` provenance | `board/` (blocks only) | `claude-haiku-4-5` | — | — |
| `@QA` | active | all source | `tests/` | `claude-sonnet-4-6` | — | `uv run pytest tests/`, `npm test` |
| `@Docs` | active | source, `contracts/` | `docs/` | `claude-haiku-4-5` | — | — |
| `@Reviewer` | active (built-in) | read-only, all | — | multi-model built-in | — | — |
| `@Verifier` | active (built-in) | read-only, all | — | built-in | — | — |
| `@Fast Context` | active (built-in) | read-only, all | — | built-in | — | — |

## Inactive roles and reasons

- **`@Pipeline`** — inactive. No separate ML training pipeline; BirdNET is consumed as a
  pre-trained TFLite model. If future work adds custom model training or evaluation
  harnesses, re-run §2 to activate this role against a new `pipeline/` scope.
- **`@Admin`** — inactive. No separate admin surface; administrative/config views are part
  of the main dashboard, owned by `@Web`. Re-activate if a distinct operator-facing route
  is introduced.
- **`@Mobile`** — inactive. Android companion app deferred to a future phase. Re-activate
  and resolve a `mobile/` write scope when that phase starts.

## Build/test commands (planned, from repo root unless noted)

- Backend run: `uv sync && uv run uvicorn src.backend.main:app`
- Backend test: `uv run pytest tests/`
- Frontend dev: `npm install && npm run dev` (run from `src/frontend/`)
- Frontend build: `npm run build` (run from `src/frontend/`)
- Frontend test: `npm test` (run from `src/frontend/`)

## Write-path collision check

Checked every active role's write path against every other active role's write path:

- `@Spec` → `spec/`
- `@Scope` → `board/`
- `@Contract` → `contracts/`
- `@Design` → `contracts/tokens/` (subdirectory of `@Contract`'s scope)
- `@Backend` → `src/backend/`
- `@Data` → `migrations/`
- `@Infra` → `infra/`
- `@Content` → `assets/artwork/`, `assets/fonts/`
- `@Web` → `src/frontend/`
- `@Security` → `contracts/` (security policy section only, subdirectory of `@Contract`'s scope)
- `@Compliance` → `board/` (blocks only, same directory as `@Scope` but disjoint file
  purpose: verdicts vs. compliance blocks)
- `@QA` → `tests/`
- `@Docs` → `docs/`

**Collisions found and resolved:**

1. `@Contract`, `@Design`, and `@Security` all touch the `contracts/` tree.
   - Resolution: split by subdirectory/section, not by full-tree ownership.
     `@Contract` owns the root of `contracts/` (API, WebSocket, data schema, versioning).
     `@Design` owns `contracts/tokens/` only. `@Security` owns only the security-policy
     section/file within `contracts/` (e.g. `contracts/security.md`), and never touches
     API or schema content. No two roles may edit the same file within `contracts/`.
2. `@Scope` and `@Compliance` both write into `board/`.
   - Resolution: file-purpose split, not path split — `@Scope` writes scope verdicts
     (e.g. `board/scope-verdicts.md` or per-card verdict files), `@Compliance` writes
     compliance blocks (e.g. `board/compliance-blocks.md`). Neither edits the other's
     file. If this proves fragile in practice, split into `board/scope/` and
     `board/compliance/` on the next binding amendment.

No other overlaps exist between active roles' write paths.
