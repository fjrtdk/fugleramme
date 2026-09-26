"""WebSocket detection downstream: /ws/detections

Read-only push channel.  The server broadcasts detection events to all open
connections belonging to the authenticated user.  Clients send nothing after
the handshake; any incoming messages are silently discarded.

Authentication is via query-parameter JWT.  Invalid token → close 4001.
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError

from src.backend.auth.jwt_utils import decode_token
from src.backend.ws.manager import manager

router = APIRouter(tags=["ws"])
logger = logging.getLogger("fugleramme.ws.detections")


@router.websocket("/ws/detections")
async def detections_ws(websocket: WebSocket, token: str | None = None):
    await websocket.accept()

    # ── Auth ─────────────────────────────────────────────────────────────────
    user_id: str | None = None
    if token:
        try:
            payload = decode_token(token)
            user_id = payload["sub"]
        except (JWTError, KeyError):
            user_id = None

    if user_id is None:
        await websocket.close(code=4001)
        return
    manager.register(user_id, websocket)
    logger.info("detections connected user=%s", user_id)

    try:
        while True:
            # Client is expected to be silent; ignore anything it sends.
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("detections disconnected user=%s", user_id)
    except Exception:
        logger.exception("detections error user=%s", user_id)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        manager.unregister(user_id, websocket)
