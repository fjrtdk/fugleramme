"""User profile endpoint tests.

Covers: PATCH /api/v1/users/me — onboarding_seen, unauthenticated access,
and no-op patch (empty body).
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_patch_onboarding_seen_to_true(authed_client: AsyncClient):
    resp = await authed_client.patch(
        "/api/v1/users/me",
        json={"onboarding_seen": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["onboarding_seen"] is True


async def test_patch_onboarding_seen_persists(authed_client: AsyncClient):
    """A subsequent GET /me should still show onboarding_seen=True."""
    await authed_client.patch("/api/v1/users/me", json={"onboarding_seen": True})
    me_resp = await authed_client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["onboarding_seen"] is True


async def test_patch_without_auth_returns_401(client: AsyncClient):
    resp = await client.patch(
        "/api/v1/users/me",
        json={"onboarding_seen": True},
    )
    assert resp.status_code == 401


async def test_patch_empty_body_returns_current_profile(authed_client: AsyncClient):
    """An empty PATCH is valid and returns the unchanged profile."""
    resp = await authed_client.patch("/api/v1/users/me", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert "email" in data
    assert "username" in data
    assert "onboarding_seen" in data
    assert "created_at" in data
    assert "updated_at" in data
