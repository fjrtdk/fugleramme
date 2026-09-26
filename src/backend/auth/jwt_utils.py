"""JWT encode/decode utilities."""

from datetime import datetime, timezone, timedelta

from jose import jwt

from src.backend.config import settings


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
    """Decode and validate a JWT.  Raises jose.JWTError on any failure."""
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
    )
