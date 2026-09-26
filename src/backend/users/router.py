"""User profile endpoints."""

import re
from datetime import datetime, timezone
from typing import Optional

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, field_validator

from src.backend.auth.deps import get_current_user
from src.backend.database import get_db

router = APIRouter(prefix="/users", tags=["users"])

_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_-]+$')


class _PatchUserRequest(BaseModel):
    username: Optional[str] = None
    onboarding_seen: Optional[bool] = None

    @field_validator("username")
    @classmethod
    def _username_shape(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not 1 <= len(v) <= 64:
            raise ValueError("1–64 characters")
        if not _USERNAME_RE.match(v):
            raise ValueError("alphanumeric, hyphens and underscores only")
        return v


class _UserProfile(BaseModel):
    id: str
    email: str
    username: str
    onboarding_seen: bool
    created_at: str
    updated_at: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.patch("/me", status_code=200, response_model=_UserProfile)
async def patch_me(
    body: _PatchUserRequest,
    current: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    user_id = current["sub"]

    async with db.execute(
        "SELECT id, email, username, onboarding_seen, created_at, updated_at "
        "FROM users WHERE id = ?",
        (user_id,),
    ) as cur:
        row = await cur.fetchone()

    if row is None:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "UNAUTHENTICATED", "message": "User not found."}},
        )

    updates: dict = {}

    if body.username is not None:
        if body.username != row["username"]:
            async with db.execute(
                "SELECT 1 FROM users WHERE username = ? AND id != ?",
                (body.username, user_id),
            ) as cur2:
                if await cur2.fetchone():
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "error": {
                                "code": "VALIDATION_ERROR",
                                "message": "Username is already taken.",
                            }
                        },
                    )
        updates["username"] = body.username

    if body.onboarding_seen is True:
        # Can only be set to True; cannot be reverted to False via this endpoint.
        updates["onboarding_seen"] = 1

    if not updates:
        return _UserProfile(
            id=row["id"],
            email=row["email"],
            username=row["username"],
            onboarding_seen=bool(row["onboarding_seen"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    now = _now_iso()
    updates["updated_at"] = now
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [user_id]

    await db.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
    await db.commit()

    async with db.execute(
        "SELECT id, email, username, onboarding_seen, created_at, updated_at "
        "FROM users WHERE id = ?",
        (user_id,),
    ) as cur:
        updated = await cur.fetchone()

    return _UserProfile(
        id=updated["id"],
        email=updated["email"],
        username=updated["username"],
        onboarding_seen=bool(updated["onboarding_seen"]),
        created_at=updated["created_at"],
        updated_at=updated["updated_at"],
    )


@router.delete("/me", status_code=204)
async def delete_me(
    response: Response,
    current: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    user_id = current["sub"]

    await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    await db.commit()

    response.delete_cookie("fugleramme_session")
