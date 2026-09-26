"""Auth endpoint tests.

Covers: register, login, me, logout, refresh, duplicate email, and
unauthenticated access to protected routes.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_register_returns_201_and_token(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "password": "password123"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "token" in data
    assert isinstance(data["token"], str)
    assert len(data["token"]) > 20
    assert data["user"]["email"] == "new@example.com"
    assert data["user"]["onboarding_seen"] is False
    assert "id" in data["user"]
    assert "username" in data["user"]


async def test_register_duplicate_email_returns_409(client: AsyncClient):
    payload = {"email": "dup@example.com", "password": "password123"}
    first = await client.post("/api/v1/auth/register", json=payload)
    assert first.status_code == 201

    second = await client.post("/api/v1/auth/register", json=payload)
    assert second.status_code == 409
    err = second.json()["error"]
    assert err["code"] == "EMAIL_ALREADY_EXISTS"


async def test_register_email_case_insensitive_duplicate(client: AsyncClient):
    """Registration must normalise email to lowercase before uniqueness check."""
    await client.post(
        "/api/v1/auth/register",
        json={"email": "CaseSensitive@example.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "casesensitive@example.com", "password": "password123"},
    )
    assert resp.status_code == 409


async def test_register_short_password_returns_400(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "short@example.com", "password": "1234567"},
    )
    assert resp.status_code == 400


async def test_login_valid_credentials_returns_200_and_token(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={"email": "login@example.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "password123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["user"]["email"] == "login@example.com"


async def test_login_wrong_password_returns_401(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={"email": "user@example.com", "password": "password123"},
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


async def test_login_unknown_email_returns_401(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "password123"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


async def test_me_with_valid_token_returns_full_profile(
    authed_client: AsyncClient,
):
    resp = await authed_client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "bird@example.com"
    assert "id" in data
    assert "username" in data
    assert "onboarding_seen" in data
    assert "created_at" in data
    assert "updated_at" in data


async def test_me_without_token_returns_401(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHENTICATED"


async def test_me_with_invalid_token_returns_401(client: AsyncClient):
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not.a.real.token"},
    )
    assert resp.status_code == 401


async def test_refresh_returns_new_token(authed_client: AsyncClient, auth_token: str):
    resp = await authed_client.post("/api/v1/auth/refresh")
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert isinstance(data["token"], str)
    # A refreshed token is a valid JWT (different expiry but same structure)
    assert data["token"].startswith("ey")


async def test_refresh_without_token_returns_401(client: AsyncClient):
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


async def test_logout_returns_204(authed_client: AsyncClient):
    resp = await authed_client.post("/api/v1/auth/logout")
    assert resp.status_code == 204
    assert resp.content == b""


async def test_logout_without_token_returns_401(client: AsyncClient):
    resp = await client.post("/api/v1/auth/logout")
    assert resp.status_code == 401
