# Plan: Collection display mode + detection persistence fix

## Problems to solve

1. **Collage birds disappear after ~60 seconds** regardless of `lookback_window`. This is caused by a hardcoded `BIRD_LINGER_MS = 60_000` timer in `collage.ts`.
2. **Detections are not persisted per-user.** The backend writes detections to a local SQLite file (`src/backend/database.py`), so they do not survive server restarts or appear on other devices.
3. **No historical detections are loaded** when the app starts. The frontend only renders live WebSocket detections.
4. **User wants a "Collection" display mode** that shows detected birds up to `max_species` and keeps them permanently (overriding `lookback_window` and `species_sort`).

## Goal

- Add `collection` as a new `display_mode`.
- Move detection storage from local SQLite to Supabase `public.detections` so detections follow the user across devices.
- Load the user's detection history on app start.
- Make `collage` respect `lookback_window` and `max_species` instead of a fixed 60-second linger.
- Make `collection` keep birds indefinitely and replace oldest birds FIFO when `max_species` is reached.
- Make all display modes (`collage`, `collection`, `latest_bird`, `newest_arrival`) render from the same Supabase-backed detection history so three logged-in devices show the same birds.
- Make `latest_bird` and `newest_arrival` keep the current bird visible until a new detection arrives (no timeout disappearance).

## Data model

### Supabase `public.detections` (already exists)

```sql
CREATE TABLE IF NOT EXISTS public.detections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  species_common      text        NOT NULL,
  species_scientific  text        NOT NULL,
  confidence          float8      NOT NULL,
  illustration_path   text,
  detected_at         timestamptz NOT NULL DEFAULT now()
);
```

This table already has RLS policies. We will use it.

### Frontend `Detection` type

Already matches. No change needed.

## Backend changes

### `src/backend/ws/audio.py`

Replace the SQLite insert in `_process_buffer` with a Supabase insert via the existing `supabase` client or an async HTTP call to PostgREST.

Current code:
```python
await db.execute(
    """
    INSERT INTO detections
      (id, user_id, species_common, species_scientific, confidence, illustration_path, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """,
    (...)
)
```

Replace with:
```python
from src.backend.config import settings
import httpx

async def _save_detection_to_supabase(user_id: str, det: Detection) -> None:
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{settings.supabase_url}/rest/v1/detections",
            headers={
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {token}",  # need user's token
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            json={...},
        )
```

> **Open decision:** The audio WebSocket currently validates the token but does not keep the raw Supabase user token for PostgREST writes. We can either:
> - A) Keep the token from the WebSocket query param and use it for PostgREST.
> - B) Use a service-role key (not recommended; exposes admin access).
> - C) Keep SQLite for detections and sync to Supabase asynchronously via a background job.
>
> **Recommendation:** Option A. The token is already available in `audio.py` via the `token` query parameter.

### `src/backend/detections/router.py`

Currently reads from SQLite. Change it to read from Supabase via PostgREST using the user's bearer token. Or remove it if the frontend will query Supabase directly.

> **Recommendation:** Have the frontend query Supabase directly via the Supabase client (consistent with settings). Then the `/api/v1/detections` endpoint can be deprecated or kept as a thin wrapper.

### `src/backend/database.py`

The local SQLite `detections` table becomes unused. We can leave it or drop it. For safety, leave the table but stop writing to it.

## Frontend changes

### `src/frontend/src/types.ts`

```ts
export interface Settings {
  display_mode: 'collage' | 'latest_bird' | 'newest_arrival' | 'collection';
  // ... rest unchanged
}
```

No new settings needed. `max_species` controls how many birds are shown in collection.

### `src/frontend/src/api/detections.ts` (new or update existing)

Add functions:

```ts
export async function loadDetections(
  lookback?: '15m' | '1h' | '6h' | '24h' | 'all'
): Promise<Detection[]> { ... }

export async function saveDetection(det: Detection): Promise<void> { ... }

export async function clearDetections(): Promise<void> { ... }
```

Use `supabase.from('detections').select('*').eq('user_id', user.id).gte('detected_at', cutoff).order('detected_at', { ascending: false }).limit(max)`.

### `src/frontend/src/state.ts`

Add a `detections` store and methods:

```ts
let _detections: Detection[] = [];

export const state = {
  // existing methods...
  getDetections: () => _detections,
  setDetections: (d: Detection[]) => { _detections = d; },
  addDetection: (d: Detection) => { _detections.push(d); },
};
```

### `src/frontend/src/ws/detections.ts`

On each incoming detection:
1. Add to state store.
2. Save to Supabase (or let the backend continue saving; see decision below).
3. Notify display handlers.

> **Decision:** It is simpler and more reliable for the backend to save detections. The frontend just renders. But the backend needs the user's token to write to Supabase. Alternatively, the frontend can save detections via Supabase client after receiving them from the WebSocket. This duplicates saves if backend also writes.
>
> **Recommendation:** Backend saves to Supabase; frontend loads from Supabase on start and listens to WebSocket for real-time additions.

### `src/frontend/src/views/dashboard.ts`

- Add `collection` to the display mode selector.
- When `collection` is selected, disable/hide `lookback_window` and `species_sort` because they are overridden.

### `src/frontend/src/display/collage.ts`

Rewrite the linger logic:

- On mount/load, load historical detections from state based on `lookback_window` and `max_species`.
- When a new detection arrives, add/update it.
- Re-render based on `lookback_window` cutoff instead of a fixed 60-second timer.
- Remove `BIRD_LINGER_MS` usage for collage.
- `lookback_window` is the **only** mode that uses `lookback_window`; other modes ignore it.

### `src/frontend/src/display/collection.ts` (new)

New display mode:

- Loads all historical detections up to `max_species`.
- Birds never fade out.
- Deduplicate by species; keep highest-confidence entry per species.
- Layout similar to collage but permanent.
- When a new species is detected and the collection already has `max_species` entries, remove the oldest entry (FIFO) and add the new one.

### `src/frontend/src/views/display.ts`

Add `collection` branch in the display router:

```ts
if (mode === 'collection') {
  import('../display/collection.js').then(m => m.handleDetection(state.getDetections(), settings));
}
```

## Migrations

None needed for `public.detections` — it already exists.

Possibly update `user_settings` if any new column is needed. Currently none.

### `src/frontend/src/display/latest-bird.ts`

Remove any auto-timeout. Keep the latest detected bird visible until a new detection arrives.

### `src/frontend/src/display/newest-arrival.ts`

Remove any auto-timeout. Keep the newest arrival visible until the next new species is detected. The existing `lookback_window`-based novelty check can remain to decide *which* species count as "new", but the rendered bird stays on screen.

## Acceptance criteria

- [ ] `display_mode` includes `collection`.
- [ ] Collage respects `lookback_window` and `max_species`; birds do not disappear after 60s.
- [ ] `lookback_window` only affects collage; it is ignored in `collection`, `latest_bird`, and `newest_arrival`.
- [ ] Collection shows up to `max_species` detected birds, ignoring `lookback_window` and `species_sort`.
- [ ] Collection replaces the oldest bird FIFO when `max_species` is reached and a new species is detected.
- [ ] Latest bird stays visible until the next detection.
- [ ] Newest arrival stays visible until the next new species is detected.
- [ ] Detected birds are saved to Supabase `public.detections`.
- [ ] On login on another device, all display modes show the same detection-backed state.
- [ ] No regression in audio capture or WebSocket connection.

## Files to change

| File | Change |
|------|--------|
| `src/frontend/src/types.ts` | Add `collection` to display_mode union |
| `src/frontend/src/state.ts` | Add detections store |
| `src/frontend/src/api/detections.ts` | New: load/save/clear detections from Supabase |
| `src/frontend/src/ws/detections.ts` | Add detections to state; maybe save to Supabase |
| `src/frontend/src/views/dashboard.ts` | Add collection option; disable irrelevant controls |
| `src/frontend/src/views/display.ts` | Route collection mode |
| `src/frontend/src/display/collage.ts` | Respect lookback_window; remove fixed linger |
| `src/frontend/src/display/collection.ts` | New permanent collection display |
| `src/backend/ws/audio.py` | Save detections to Supabase instead of SQLite |
| `src/backend/detections/router.py` | Read from Supabase or deprecate |

## Open questions for user

1. ✅ Backend saves detections using the user's token from the WebSocket.
2. ✅ Add a "Clear collection" button in Settings.

## User clarifications received

- Collage must also sync across devices.
- Latest bird & newest arrival should not disappear until a new detection arrives.
- `lookback_window` only applies to collage mode.
- In collection mode, when `max_species` is reached, new birds replace the oldest birds (FIFO).
- Backend persists detections to Supabase.
- Clear-collection button belongs in Settings.
