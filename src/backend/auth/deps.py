"""FastAPI dependency that extracts and validates the current user from a
JWT carried in either the Authorization Bearer header or the httpOnly cookie."""

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from src.backend.auth.jwt_utils import decode_token

_bearer = HTTPBearer(auto_error=False)


def _extract_raw_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
) -> str | None:
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials
    return request.cookies.get("fugleramme_session")


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Return the decoded JWT payload.  Raises 401 if token is absent or invalid."""
    token = _extract_raw_token(request, credentials)
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
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "UNAUTHENTICATED",
                    "message": "Invalid or expired token.",
                }
            },
        )
    return payload
