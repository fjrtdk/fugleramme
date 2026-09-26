"""Settings endpoints: GET /api/v1/settings and PUT /api/v1/settings.

GET  — returns the user's settings row, or the documented defaults if no row exists.
PUT  — full-replace: validates all fields then upserts; broadcasts settings_changed
       to every open /ws/detections connection for the same user.
"""

import logging
from typing import Any

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.backend.auth.deps import get_current_user
from src.backend.database import get_db
from src.backend.ws.manager import manager

router = APIRouter(tags=["settings"])
logger = logging.getLogger("fugleramme.settings")

# ── Constants ─────────────────────────────────────────────────────────────────

_DEFAULTS: dict[str, Any] = {
    "display_mode": "collage",
    "margin_percent": 4,
    "lookback_window": "24h",
    "max_species": 40,
    "species_sort": "most_heard",
}

_DISPLAY_MODES = {"collage", "latest_bird", "newest_arrival"}
_LOOKBACK_WINDOWS = {"15m", "1h", "6h", "24h", "all"}
_SPECIES_SORTS = {"most_heard", "rarest_window", "rarest_all_time"}


# ── Request body model ────────────────────────────────────────────────────────
# All fields typed as Any so Pydantic only enforces presence (no default →
# required), not value constraints.  Value validation is done manually below so
# we can return the exact error messages specified in the contract.

class SettingsPutBody(BaseModel):
    display_mode: Any
    margin_percent: Any
    lookback_window: Any
    max_species: Any
    species_sort: Any


# ── Validation helpers ────────────────────────────────────────────────────────

def _validation_error(message: str) -> None:
    raise HTTPException(
        status_code=400,
        detail={"error": {"code": "VALIDATION_ERROR", "message": message}},
    )


def _validate(body: SettingsPutBody) -> dict[str, Any]:
    """Validate each field and return a clean dict ready for persistence."""

    # display_mode
    if body.display_mode not in _DISPLAY_MODES:
        _validation_error("display_mode must be one of: collage, latest_bird, newest_arrival.")

    # margin_percent — must be a plain int in [0, 20]; booleans are ints in
    # Python so we explicitly exclude them.
    mp = body.margin_percent
    if not isinstance(mp, int) or isinstance(mp, bool) or mp < 0 or mp > 20:
        _validation_error("margin_percent must be an integer between 0 and 20 inclusive.")

    # lookback_window
    if body.lookback_window not in _LOOKBACK_WINDOWS:
        _validation_error("lookback_window must be one of: 15m, 1h, 6h, 24h, all.")

    # max_species — null is valid; 0 and negative integers are not
    ms = body.max_species
    if ms is not None:
        if not isinstance(ms, int) or isinstance(ms, bool) or ms < 1:
            _validation_error("max_species must be a positive integer or null.")

    # species_sort
    if body.species_sort not in _SPECIES_SORTS:
        _validation_error(
            "species_sort must be one of: most_heard, rarest_window, rarest_all_time."
        )

    return {
        "display_mode": body.display_mode,
        "margin_percent": mp,
        "lookback_window": body.lookback_window,
        "max_species": ms,
        "species_sort": body.species_sort,
    }


# ── GET /settings ─────────────────────────────────────────────────────────────

@router.get("/settings", status_code=200)
async def get_settings(
    current: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    user_id: str = current["sub"]

    async with db.execute(
        "SELECT display_mode, margin_percent, lookback_window, max_species, species_sort "
        "FROM user_settings WHERE user_id = ?",
        (user_id,),
    ) as cur:
        row = await cur.fetchone()

    if row is None:
        return dict(_DEFAULTS)

    return {
        "display_mode": row["display_mode"],
        "margin_percent": row["margin_percent"],
        "lookback_window": row["lookback_window"],
        "max_species": row["max_species"],
        "species_sort": row["species_sort"],
    }


# ── PUT /settings ─────────────────────────────────────────────────────────────

@router.put("/settings", status_code=200)
async def put_settings(
    body: SettingsPutBody,
    current: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
) -> dict[str, Any]:
    user_id: str = current["sub"]
    validated = _validate(body)

    await db.execute(
        """
        INSERT INTO user_settings
            (user_id, display_mode, margin_percent, lookback_window, max_species, species_sort)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
            display_mode    = excluded.display_mode,
            margin_percent  = excluded.margin_percent,
            lookback_window = excluded.lookback_window,
            max_species     = excluded.max_species,
            species_sort    = excluded.species_sort
        """,
        (
            user_id,
            validated["display_mode"],
            validated["margin_percent"],
            validated["lookback_window"],
            validated["max_species"],
            validated["species_sort"],
        ),
    )
    await db.commit()

    # Broadcast settings_changed to all open /ws/detections connections for
    # this user so the display updates without a page reload (US-010 AC 3).
    await manager.broadcast(
        user_id,
        {
            "type": "settings_changed",
            "settings": validated,
        },
    )

    logger.info("settings updated user=%s display_mode=%s", user_id, validated["display_mode"])
    return validated
