"""Detection and species endpoints."""

from datetime import datetime, timezone
from typing import Optional

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query

from src.backend.auth.deps import get_current_user
from src.backend.database import get_db

router = APIRouter(tags=["detections"])


@router.get("/detections", status_code=200)
async def list_detections(
    limit: int = Query(default=50, ge=1, le=200),
    before: Optional[datetime] = Query(default=None),
    current: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    user_id = current["sub"]

    if before is not None:
        before_str = before.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        async with db.execute(
            "SELECT id, species_common, species_scientific, confidence, "
            "illustration_path, detected_at "
            "FROM detections "
            "WHERE user_id = ? AND detected_at < ? "
            "ORDER BY detected_at DESC "
            "LIMIT ?",
            (user_id, before_str, limit),
        ) as cur:
            rows = await cur.fetchall()
    else:
        async with db.execute(
            "SELECT id, species_common, species_scientific, confidence, "
            "illustration_path, detected_at "
            "FROM detections "
            "WHERE user_id = ? "
            "ORDER BY detected_at DESC "
            "LIMIT ?",
            (user_id, limit),
        ) as cur:
            rows = await cur.fetchall()

    detections = [
        {
            "id": r["id"],
            "species_common": r["species_common"],
            "species_scientific": r["species_scientific"],
            "confidence": r["confidence"],
            "illustration_path": r["illustration_path"],
            "detected_at": r["detected_at"],
        }
        for r in rows
    ]

    next_cursor = detections[-1]["detected_at"] if len(detections) == limit else None

    return {"detections": detections, "next_cursor": next_cursor}


@router.get("/species", status_code=200)
async def list_species(
    current: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT common_name, scientific_name, body_mass_g, illustration_path FROM species"
    ) as cur:
        rows = await cur.fetchall()

    species = [
        {
            "common_name": r["common_name"],
            "scientific_name": r["scientific_name"],
            "body_mass_g": r["body_mass_g"],
            "illustration_path": r["illustration_path"],
        }
        for r in rows
    ]

    return {"species": species}
