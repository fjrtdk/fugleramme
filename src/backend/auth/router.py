"""Auth endpoints: register, login, logout, refresh, me."""

import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import bcrypt as _bcrypt
import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, field_validator

from src.backend.auth.deps import get_current_user
from src.backend.auth.jwt_utils import create_token
from src.backend.config import settings
from src.backend.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

_USERNAME_RE = re.compile(r'^[a-zA-Z0-9_-]+$')


# ── Pydantic models ────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None

    @field_validator("password")
    @classmethod
    def _password_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("min 8 characters")
        if len(v) > 128:
            raise ValueError("max 128 characters")
        return v

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


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# Response shapes follow the contract exactly.

class _UserInAuth(BaseModel):
    id: str
    email: str
    username: str
    onboarding_seen: bool
    created_at: str


class _AuthResponse(BaseModel):
    user: _UserInAuth
    token: str


class _RefreshResponse(BaseModel):
    token: str


class _UserProfile(BaseModel):
    id: str
    email: str
    username: str
    onboarding_seen: bool
    created_at: str
    updated_at: str


# ── Helpers ────────────────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def _unique_username(db: aiosqlite.Connection, base: str) -> str:
    """Derive a unique username from base, appending numbers on collision."""
    sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', base)[:60] or "user"
    candidate = sanitized
    n = 1
    while True:
        async with db.execute("SELECT 1 FROM users WHERE username = ?", (candidate,)) as cur:
            if await cur.fetchone() is None:
                return candidate
        candidate = f"{sanitized}{n}"
        n += 1


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="fugleramme_session",
        value=token,
        httponly=True,
        samesite="strict",
        secure=settings.is_production,
        max_age=settings.jwt_expire_hours * 3600,
    )


def _row_to_profile(row) -> _UserProfile:
    return _UserProfile(
        id=row["id"],
        email=row["email"],
        username=row["username"],
        onboarding_seen=bool(row["onboarding_seen"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.post("/register", status_code=201, response_model=_AuthResponse)
async def register(
    body: RegisterRequest,
    response: Response,
    db: aiosqlite.Connection = Depends(get_db),
):
    email = body.email.lower()

    async with db.execute("SELECT 1 FROM users WHERE email = ?", (email,)) as cur:
        if await cur.fetchone():
            raise HTTPException(
                status_code=409,
                detail={
                    "error": {
                        "code": "EMAIL_ALREADY_EXISTS",
                        "message": "An account with this email already exists.",
                    }
                },
            )

    if body.username:
        async with db.execute("SELECT 1 FROM users WHERE username = ?", (body.username,)) as cur:
            if await cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": {
                            "code": "VALIDATION_ERROR",
                            "message": "Username is already taken.",
                        }
                    },
                )
        username = body.username
    else:
        username = await _unique_username(db, email.split("@")[0])

    user_id = str(uuid.uuid4())
    now = _now_iso()
    pw_hash = _bcrypt.hashpw(body.password.encode(), _bcrypt.gensalt()).decode()

    await db.execute(
        "INSERT INTO users (id, username, email, password_hash, onboarding_seen, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, 0, ?, ?)",
        (user_id, username, email, pw_hash, now, now),
    )
    await db.commit()

    token = create_token(user_id, email)
    _set_cookie(response, token)

    return _AuthResponse(
        user=_UserInAuth(
            id=user_id,
            email=email,
            username=username,
            onboarding_seen=False,
            created_at=now,
        ),
        token=token,
    )


@router.post("/login", status_code=200, response_model=_AuthResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: aiosqlite.Connection = Depends(get_db),
):
    email = body.email.lower()
    async with db.execute(
        "SELECT id, email, username, password_hash, onboarding_seen, created_at "
        "FROM users WHERE email = ?",
        (email,),
    ) as cur:
        row = await cur.fetchone()

    if row is None or not _bcrypt.checkpw(body.password.encode(), row["password_hash"].encode()):
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "INVALID_CREDENTIALS",
                    "message": "Invalid email or password.",
                }
            },
        )

    token = create_token(row["id"], row["email"])
    _set_cookie(response, token)

    return _AuthResponse(
        user=_UserInAuth(
            id=row["id"],
            email=row["email"],
            username=row["username"],
            onboarding_seen=bool(row["onboarding_seen"]),
            created_at=row["created_at"],
        ),
        token=token,
    )


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    _current: dict = Depends(get_current_user),
):
    response.delete_cookie("fugleramme_session")


@router.post("/refresh", status_code=200, response_model=_RefreshResponse)
async def refresh(
    response: Response,
    current: dict = Depends(get_current_user),
):
    token = create_token(current["sub"], current["email"])
    _set_cookie(response, token)
    return _RefreshResponse(token=token)


@router.get("/me", status_code=200, response_model=_UserProfile)
async def me(
    current: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT id, email, username, onboarding_seen, created_at, updated_at "
        "FROM users WHERE id = ?",
        (current["sub"],),
    ) as cur:
        row = await cur.fetchone()

    if row is None:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "UNAUTHENTICATED", "message": "User not found."}},
        )

    return _row_to_profile(row)
