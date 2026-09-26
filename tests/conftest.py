"""Shared pytest fixtures for the Fugleramme backend test suite.

Architecture notes:
- HTTP tests (test_auth, test_users, test_settings, test_detections) use
  pytest-asyncio + httpx.AsyncClient backed by ASGITransport.
- WebSocket tests (test_websocket) use starlette.testclient.TestClient, which
  is synchronous but supports websocket_connect().

In both cases the real lifespan is suppressed with _SkipLifespan to avoid
trying to load the BirdNET TFLite model (not present in CI).  The schema is
initialised manually via init_db() before each test.  A fresh per-test SQLite
file in tmp_path ensures full isolation with no files left behind after the
test run completes (tmp_path is cleaned by pytest).
"""

import asyncio

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from starlette.testclient import TestClient

from src.backend.config import settings
from src.backend.database import init_db
from src.backend.main import app


# ---------------------------------------------------------------------------
# ASGI lifespan bypass
# ---------------------------------------------------------------------------


class _SkipLifespan:
    """Wrap an ASGI app so that lifespan events are handled locally.

    starlette.testclient.TestClient triggers ASGI lifespan startup/shutdown.
    Without this wrapper the real lifespan would attempt to load BirdNET and
    seed the species table -- both of which require runtime assets that are
    not present in a unit-test environment.

    httpx.AsyncClient + ASGITransport does NOT emit lifespan events, so the
    wrapper is a transparent pass-through for HTTP test requests.
    """

    def __init__(self, inner):
        self._inner = inner

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            while True:
                message = await receive()
                if message["type"] == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif message["type"] == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        else:
            await self._inner(scope, receive, send)


# ---------------------------------------------------------------------------
# Async (HTTP) fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client(tmp_path):
    """AsyncClient against the test app with a fresh, isolated SQLite file.

    The database path in settings is patched before init_db() runs, so all
    code paths that read settings.database_path (get_db, init_db, the audio
    WebSocket handler) resolve to the same temporary file.
    """
    db_path = str(tmp_path / "test.db")
    settings.database_path = db_path
    await init_db()

    transport = ASGITransport(app=_SkipLifespan(app))
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    settings.database_path = "fugleramme.db"


@pytest_asyncio.fixture
async def auth_token(client: AsyncClient) -> str:
    """Register a canonical test user and return a valid JWT."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "bird@example.com", "password": "password123"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["token"]


@pytest_asyncio.fixture
async def authed_client(client: AsyncClient, auth_token: str) -> AsyncClient:
    """AsyncClient with the Authorization header pre-set for the test user."""
    client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return client


# ---------------------------------------------------------------------------
# Sync (WebSocket) fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def ws_client(tmp_path):
    """Synchronous starlette TestClient with an isolated SQLite file.

    A fresh event loop bootstraps the schema before the TestClient starts its
    own internal event loop.  raise_server_exceptions=False prevents server-
    side exceptions (e.g. graceful WebSocketDisconnect handling) from being
    re-raised in the test process.
    """
    db_path = str(tmp_path / "ws_test.db")
    settings.database_path = db_path

    loop = asyncio.new_event_loop()
    loop.run_until_complete(init_db())
    loop.close()

    with TestClient(_SkipLifespan(app), raise_server_exceptions=False) as c:
        yield c

    settings.database_path = "fugleramme.db"
