"""WebSocket channel tests.

Covers auth acceptance and rejection on both channels:
  - /ws/audio  — audio upstream
  - /ws/detections — detection downstream

Uses starlette.testclient.TestClient (synchronous) because httpx does not
support WebSocket.  The ws_client fixture (conftest.py) applies _SkipLifespan
so BirdNET loading is bypassed and a fresh SQLite database is used per test.

Implementation notes
--------------------
Both WebSocket handlers call `await websocket.accept()` before validating the
JWT.  An invalid or missing token therefore results in:
  1. HTTP 101 upgrade (accept succeeds)
  2. Server sends close frame with code 4001
  3. The next client receive call raises WebSocketDisconnect(code=4001)

This matches the contract-specified close code behaviour even though the HTTP
upgrade itself was not rejected with 401 (the server accepts first, then
closes).  Tests verify the close code rather than the HTTP upgrade status.
"""

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _register_and_get_token(c: TestClient, email: str = "wstest@example.com") -> str:
    """Register a user via the HTTP API and return a JWT for WebSocket auth."""
    resp = c.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["token"]


# ---------------------------------------------------------------------------
# /ws/audio
# ---------------------------------------------------------------------------


def test_ws_audio_valid_token_connects(ws_client: TestClient):
    """A valid JWT allows the audio WebSocket to connect and stay open."""
    token = _register_and_get_token(ws_client)
    with ws_client.websocket_connect(f"/ws/audio?token={token}"):
        pass  # clean client-initiated close


def test_ws_audio_no_token_closes_4001(ws_client: TestClient):
    """Missing token: server accepts then closes with code 4001."""
    close_code = None
    with ws_client.websocket_connect("/ws/audio") as ws:
        try:
            ws.receive_bytes()
        except WebSocketDisconnect as exc:
            close_code = exc.code
    assert close_code == 4001


def test_ws_audio_invalid_token_closes_4001(ws_client: TestClient):
    """Malformed JWT: server accepts then closes with code 4001."""
    close_code = None
    with ws_client.websocket_connect("/ws/audio?token=not.a.valid.jwt") as ws:
        try:
            ws.receive_bytes()
        except WebSocketDisconnect as exc:
            close_code = exc.code
    assert close_code == 4001


# ---------------------------------------------------------------------------
# /ws/detections
# ---------------------------------------------------------------------------


def test_ws_detections_valid_token_connects_and_stays_open(ws_client: TestClient):
    """A valid JWT allows the detections WebSocket to connect."""
    token = _register_and_get_token(ws_client, email="ws2@example.com")
    with ws_client.websocket_connect(f"/ws/detections?token={token}"):
        pass  # clean client-initiated close


def test_ws_detections_no_token_closes_4001(ws_client: TestClient):
    """Missing token: server accepts then closes with code 4001."""
    close_code = None
    with ws_client.websocket_connect("/ws/detections") as ws:
        try:
            ws.receive_text()
        except WebSocketDisconnect as exc:
            close_code = exc.code
    assert close_code == 4001


def test_ws_detections_invalid_token_closes_4001(ws_client: TestClient):
    """Malformed JWT: server accepts then closes with code 4001."""
    close_code = None
    with ws_client.websocket_connect(
        "/ws/detections?token=bad.token.here"
    ) as ws:
        try:
            ws.receive_text()
        except WebSocketDisconnect as exc:
            close_code = exc.code
    assert close_code == 4001
