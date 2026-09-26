"""JWT encode/decode utilities."""

import logging
from datetime import datetime, timezone, timedelta

import httpx
from jose import jwt
from jose.exceptions import JWTError

from src.backend.config import settings

logger = logging.getLogger("fugleramme.auth.jwt_utils")


def create_token(user_id: str, email: str) -> str:
    """Return a signed HS256 JWT for the given user."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=settings.jwt_expire_hours)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Decode and validate an app-issued JWT.  Raises jose.JWTError on any failure."""
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )


def decode_supabase_token(token: str) -> dict:
    """Decode and validate a Supabase (or Verdent BaaS proxy) session JWT.

    Supabase tokens are signed with a project-specific secret (HS256) that is
    distinct from the app's own JWT secret, and carry an "authenticated"
    audience claim rather than the app's shape.  Raises jose.JWTError on any
    failure, including a missing SUPABASE_JWT_SECRET configuration.
    """
    if not settings.supabase_jwt_secret:
        raise JWTError("SUPABASE_JWT_SECRET is not configured")
    return jwt.decode(
        token,
        settings.supabase_jwt_secret,
        algorithms=["HS256"],
        options={"verify_aud": False},
    )


def decode_any_token(token: str) -> dict:
    """Decode a JWT issued by either the app's own auth or Supabase.

    Tries the app-issued secret first (existing behaviour, used by the
    legacy /auth/* endpoints and tests), then falls back to the Supabase
    secret.  Raises jose.JWTError if neither succeeds.
    """
    try:
        return decode_token(token)
    except JWTError:
        return decode_supabase_token(token)


async def validate_supabase_token(token: str, request_origin: str) -> str | None:
    """Validate a Supabase (or Verdent BaaS proxy) access token via the
    Supabase Auth REST API instead of local JWT decoding.

    This avoids needing SUPABASE_JWT_SECRET, which is not available to this
    backend.  As a side effect it also rejects expired/revoked tokens, since
    Supabase itself checks freshness.

    ``request_origin`` (scheme://host[:port]) is used when SUPABASE_URL is
    not configured, mirroring the frontend's window.location.origin fallback
    for the same-origin BaaS proxy.  Returns the user id on success, or None
    on any failure (invalid token, network error, unexpected response).
    """
    base_url = (settings.supabase_url or request_origin).rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{base_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_anon_key,
                },
            )
        if resp.status_code == 200:
            return resp.json().get("id")
        return None
    except httpx.HTTPError:
        logger.warning("Supabase token validation request failed", exc_info=True)
        return None
