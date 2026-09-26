"""Settings endpoint tests.

Covers: GET /api/v1/settings, PUT /api/v1/settings — defaults, CRUD,
validation (invalid display_mode, margin out of range, invalid enum values,
max_species=0), null max_species, and persistence across requests.
"""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

# Fully valid settings payload used as a baseline for mutation tests.
_VALID = {
    "display_mode": "collage",
    "margin_percent": 4,
    "lookback_window": "24h",
    "max_species": 40,
    "species_sort": "most_heard",
}


# ---------------------------------------------------------------------------
# GET /api/v1/settings
# ---------------------------------------------------------------------------


async def test_get_settings_returns_defaults_for_new_user(authed_client: AsyncClient):
    resp = await authed_client.get("/api/v1/settings")
    assert resp.status_code == 200
    data = resp.json()
    # Defaults from schema.md / contracts/api.md
    assert data["display_mode"] == "collage"
    assert data["margin_percent"] == 4
    assert data["lookback_window"] == "24h"
    assert data["max_species"] == 40
    assert data["species_sort"] == "most_heard"


async def test_get_settings_without_auth_returns_401(client: AsyncClient):
    resp = await client.get("/api/v1/settings")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PUT /api/v1/settings — happy paths
# ---------------------------------------------------------------------------


async def test_put_settings_valid_values_persists(authed_client: AsyncClient):
    payload = {
        "display_mode": "latest_bird",
        "margin_percent": 8,
        "lookback_window": "1h",
        "max_species": 20,
        "species_sort": "rarest_window",
    }
    resp = await authed_client.put("/api/v1/settings", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["display_mode"] == "latest_bird"
    assert data["margin_percent"] == 8
    assert data["lookback_window"] == "1h"
    assert data["max_species"] == 20
    assert data["species_sort"] == "rarest_window"


async def test_put_settings_persists_across_requests(authed_client: AsyncClient):
    """PUT followed by GET should return the saved values."""
    payload = {**_VALID, "display_mode": "newest_arrival", "margin_percent": 12}
    await authed_client.put("/api/v1/settings", json=payload)

    get_resp = await authed_client.get("/api/v1/settings")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["display_mode"] == "newest_arrival"
    assert data["margin_percent"] == 12


async def test_put_settings_max_species_null_accepted(authed_client: AsyncClient):
    """null max_species means 'show all' — must be accepted by the server."""
    resp = await authed_client.put(
        "/api/v1/settings",
        json={**_VALID, "max_species": None},
    )
    assert resp.status_code == 200
    assert resp.json()["max_species"] is None


async def test_put_settings_all_display_modes(authed_client: AsyncClient):
    for mode in ("collage", "latest_bird", "newest_arrival"):
        resp = await authed_client.put(
            "/api/v1/settings",
            json={**_VALID, "display_mode": mode},
        )
        assert resp.status_code == 200, f"display_mode={mode} failed: {resp.text}"
        assert resp.json()["display_mode"] == mode


async def test_put_settings_all_lookback_windows(authed_client: AsyncClient):
    for window in ("15m", "1h", "6h", "24h", "all"):
        resp = await authed_client.put(
            "/api/v1/settings",
            json={**_VALID, "lookback_window": window},
        )
        assert resp.status_code == 200, f"lookback_window={window} failed"
        assert resp.json()["lookback_window"] == window


async def test_put_settings_all_species_sorts(authed_client: AsyncClient):
    for sort in ("most_heard", "rarest_window", "rarest_all_time"):
        resp = await authed_client.put(
            "/api/v1/settings",
            json={**_VALID, "species_sort": sort},
        )
        assert resp.status_code == 200, f"species_sort={sort} failed"
        assert resp.json()["species_sort"] == sort


async def test_put_settings_margin_boundary_values(authed_client: AsyncClient):
    """margin_percent=0 and margin_percent=20 are both valid (inclusive range)."""
    for margin in (0, 20):
        resp = await authed_client.put(
            "/api/v1/settings",
            json={**_VALID, "margin_percent": margin},
        )
        assert resp.status_code == 200, f"margin_percent={margin} failed"


# ---------------------------------------------------------------------------
# PUT /api/v1/settings — validation errors
# ---------------------------------------------------------------------------


async def test_put_settings_invalid_display_mode_returns_400(authed_client: AsyncClient):
    resp = await authed_client.put(
        "/api/v1/settings",
        json={**_VALID, "display_mode": "bird_grid"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_put_settings_margin_too_high_returns_400(authed_client: AsyncClient):
    resp = await authed_client.put(
        "/api/v1/settings",
        json={**_VALID, "margin_percent": 21},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_put_settings_margin_negative_returns_400(authed_client: AsyncClient):
    resp = await authed_client.put(
        "/api/v1/settings",
        json={**_VALID, "margin_percent": -1},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_put_settings_invalid_lookback_window_returns_400(
    authed_client: AsyncClient,
):
    resp = await authed_client.put(
        "/api/v1/settings",
        json={**_VALID, "lookback_window": "2h"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_put_settings_invalid_species_sort_returns_400(authed_client: AsyncClient):
    resp = await authed_client.put(
        "/api/v1/settings",
        json={**_VALID, "species_sort": "alphabetical"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_put_settings_max_species_zero_returns_400(authed_client: AsyncClient):
    """max_species=0 is explicitly forbidden by the contract."""
    resp = await authed_client.put(
        "/api/v1/settings",
        json={**_VALID, "max_species": 0},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_put_settings_max_species_negative_returns_400(authed_client: AsyncClient):
    resp = await authed_client.put(
        "/api/v1/settings",
        json={**_VALID, "max_species": -5},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_put_settings_without_auth_returns_401(client: AsyncClient):
    resp = await client.put("/api/v1/settings", json=_VALID)
    assert resp.status_code == 401
