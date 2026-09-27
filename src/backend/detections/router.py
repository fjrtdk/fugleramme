"""Detection and species endpoints."""

from datetime import datetime, timezone
from typing import Optional

import aiosqlite
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from src.backend.auth.deps import get_current_user
from src.backend.auth.jwt_utils import decode_any_token, validate_supabase_token
from src.backend.config import settings
from src.backend.database import get_db

router = APIRouter(tags=["detections"])
_bearer = HTTPBearer(auto_error=False)


def _extract_bearer_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
) -> str | None:
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials
    return request.cookies.get("fugleramme_session")


@router.get("/detections", status_code=200)
async def list_detections(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    before: Optional[datetime] = Query(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    token = _extract_bearer_token(request, credentials)
    if not token:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "UNAUTHENTICATED",
                    "message": "Authentication required.",
                }
            },
        )

    # Prefer Supabase Auth validation (works without SUPABASE_JWT_SECRET);
    # fall back to local JWT decoding for dev tokens.
    origin = f"{request.url.scheme}://{request.url.netloc}"
    user_id = await validate_supabase_token(token, origin)
    if user_id is None:
        try:
            payload = decode_any_token(token)
            user_id = payload.get("sub")
        except JWTError:
            user_id = None

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "UNAUTHENTICATED",
                    "message": "Invalid or expired token.",
                }
            },
        )

    base_url = (settings.supabase_url or origin).rstrip("/")
    params = {
        "select": "*",
        "user_id": f"eq.{user_id}",
        "order": "detected_at.desc",
        "limit": limit,
    }
    if before is not None:
        before_str = before.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        params["detected_at"] = f"lt.{before_str}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base_url}/rest/v1/detections",
                params=params,
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {token}",
                },
            )
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "error": {
                    "code": "DETECTIONS_FETCH_FAILED",
                    "message": "Failed to fetch detections from Supabase.",
                }
            },
        ) from exc

    rows = resp.json()
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
