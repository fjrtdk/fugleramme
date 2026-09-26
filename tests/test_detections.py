"""Detection, species, and health endpoint tests.

Covers: GET /api/v1/detections (empty list, auth, limit param),
        GET /api/v1/species (auth, list shape),
        GET /health.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


async def test_health_returns_200(client: AsyncClient):
    """Health endpoint is not auth-protected and always returns 200 ok."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# GET /api/v1/detections
# ---------------------------------------------------------------------------


async def test_get_detections_returns_empty_list_initially(authed_client: AsyncClient):
    resp = await authed_client.get("/api/v1/detections")
    assert resp.status_code == 200
    data = resp.json()
    assert data["detections"] == []
    assert data["next_cursor"] is None


async def test_get_detections_without_auth_returns_401(client: AsyncClient):
    resp = await client.get("/api/v1/detections")
    assert resp.status_code == 401


async def test_get_detections_with_default_limit(authed_client: AsyncClient):
    resp = await authed_client.get("/api/v1/detections")
    assert resp.status_code == 200
    assert "detections" in resp.json()
    assert "next_cursor" in resp.json()


async def test_get_detections_custom_limit(authed_client: AsyncClient):
    resp = await authed_client.get("/api/v1/detections?limit=10")
    assert resp.status_code == 200


async def test_get_detections_limit_too_high_returns_400(authed_client: AsyncClient):
    """limit > 200 should be rejected as a validation error."""
    resp = await authed_client.get("/api/v1/detections?limit=201")
    assert resp.status_code == 400


async def test_get_detections_limit_zero_returns_400(authed_client: AsyncClient):
    """limit < 1 should be rejected."""
    resp = await authed_client.get("/api/v1/detections?limit=0")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/v1/species
# ---------------------------------------------------------------------------


async def test_get_species_returns_200_and_list(authed_client: AsyncClient):
    resp = await authed_client.get("/api/v1/species")
    assert resp.status_code == 200
    data = resp.json()
    assert "species" in data
    assert isinstance(data["species"], list)


async def test_get_species_without_auth_returns_401(client: AsyncClient):
    resp = await client.get("/api/v1/species")
    assert resp.status_code == 401
