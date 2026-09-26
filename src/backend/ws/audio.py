"""WebSocket audio upstream: /ws/audio

Accepts binary PCM frames from the client (16 kHz, PCM int16 mono, 32 768 bytes
each), accumulates 3-frame buffers, runs BirdNET TFLite inference, persists
detections to SQLite, and broadcasts results to /ws/detections clients.

Authentication is via query-parameter JWT.  Invalid token → close 4001.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError

from src.backend.auth.jwt_utils import decode_token, validate_supabase_token
from src.backend.birdnet import birdnet_state
from src.backend.birdnet.inference import run_inference
from src.backend.config import settings
from src.backend.ws.manager import manager

router = APIRouter(tags=["ws"])
logger = logging.getLogger("fugleramme.ws.audio")

_FRAME_BYTES = 32_768   # 1 s × 16 000 samples × 2 bytes  (see contracts/websocket.md)
_BUFFER_FRAMES = 3      # 3 s inference window


# ── Helpers ───────────────────────────────────────────────────────────────────


def _error_msg(code: str, message: str) -> str:
    return json.dumps({"type": "error", "code": code, "message": message})


def _illustration_path(scientific_name: str) -> str | None:
    """Derive server-relative illustration path; return None if file absent."""
    filename = scientific_name.lower().replace(" ", "_") + ".png"
    if Path(f"assets/artwork/{filename}").exists():
        return f"/assets/artwork/{filename}"
    return None


async def _apply_pragmas(db: aiosqlite.Connection) -> None:
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute("PRAGMA foreign_keys = ON")
    await db.execute("PRAGMA synchronous = NORMAL")


# ── Inference + persistence + broadcast ───────────────────────────────────────


async def _process_buffer(
    websocket: WebSocket,
    db: aiosqlite.Connection,
    user_id: str,
    buffer: list[bytes],
) -> None:
    """Run one inference cycle on the 3-frame buffer.

    1. Runs BirdNET inference.
    2. For each detection ≥ 0.5 confidence:
       a. Resolves illustration path.
       b. Inserts a row into the detections table.
    3. Builds the detection message per contracts/websocket.md.
    4. Sends the message back on the audio WebSocket.
    5. Broadcasts the same message to all /ws/detections clients for this user.
    """
    if birdnet_state is None:
        await websocket.send_text(
            _error_msg(
                "INFERENCE_FAILED",
                "BirdNET model is not loaded.  "
                "Run: uv run python -m src.backend.birdnet.download_model",
            )
        )
        return

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        detections = run_inference(buffer, birdnet_state)
    except Exception as exc:
        logger.exception("run_inference raised unexpectedly: %s", exc)
        await websocket.send_text(
            _error_msg("INFERENCE_FAILED", "BirdNET inference error.")
        )
        return

    # ── Persist and build message items ──────────────────────────────────────
    items: list[dict] = []

    for det in detections:
        illus = _illustration_path(det.scientific_name)

        # Insert into detections table
        try:
            await db.execute(
                """
                INSERT INTO detections
                    (id, user_id, species_common, species_scientific,
                     confidence, illustration_path, detected_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    user_id,
                    det.common_name,
                    det.scientific_name,
                    det.confidence,
                    illus,
                    timestamp,
                ),
            )
        except Exception:
            logger.exception("DB insert failed for detection %s", det.scientific_name)
            # Non-fatal: still broadcast the detection

        items.append(
            {
                "species_code": det.species_code,
                "common_name": det.common_name,
                "scientific_name": det.scientific_name,
                "confidence": det.confidence,
                "illustration_path": illus,
                "timestamp": timestamp,
            }
        )

    try:
        await db.commit()
    except Exception:
        logger.exception("DB commit failed")

    # ── Build and dispatch message (contract shape) ───────────────────────────
    payload = {"type": "detection", "detections": items}

    # Reply on the audio channel
    try:
        await websocket.send_json(payload)
    except Exception:
        logger.warning("Failed to send detection message on audio channel")

    # Push to /ws/detections subscribers
    await manager.broadcast(user_id, payload)

    if items:
        logger.info(
            "audio user=%s detections=%d [%s]",
            user_id,
            len(items),
            ", ".join(f"{d['common_name']} {d['confidence']:.2f}" for d in items),
        )


# ── WebSocket handler ─────────────────────────────────────────────────────────


@router.websocket("/ws/audio")
async def audio_ws(websocket: WebSocket, token: str | None = None):
    await websocket.accept()

    # ── Auth ──────────────────────────────────────────────────────────────────
    # Validate Supabase (or Verdent BaaS proxy) tokens via the Supabase Auth
    # API — no JWT secret needed.  Fall back to local app-JWT decoding for
    # local dev where /auth/* issues its own tokens.
    user_id: str | None = None
    if token:
        scheme = "https" if websocket.url.scheme == "wss" else "http"
        origin = f"{scheme}://{websocket.url.netloc}"
        user_id = await validate_supabase_token(token, origin)
        if user_id is None:
            try:
                payload = decode_token(token)
                user_id = payload["sub"]
            except (JWTError, KeyError):
                user_id = None

    if user_id is None:
        await websocket.close(code=4001)
        return

    logger.info("audio connected user=%s", user_id)

    async with aiosqlite.connect(settings.database_path) as db:
        await _apply_pragmas(db)
        db.row_factory = aiosqlite.Row

        buffer: list[bytes] = []

        try:
            while True:
                data = await websocket.receive_bytes()

                if len(data) != _FRAME_BYTES:
                    await websocket.send_text(
                        _error_msg(
                            "FRAME_SIZE_INVALID",
                            f"Expected {_FRAME_BYTES} bytes, got {len(data)}.",
                        )
                    )
                    buffer.clear()
                    continue

                buffer.append(data)

                if len(buffer) == _BUFFER_FRAMES:
                    await _process_buffer(websocket, db, user_id, buffer)
                    buffer.clear()

        except WebSocketDisconnect:
            logger.info("audio disconnected user=%s", user_id)
        except Exception:
            logger.exception("audio error user=%s", user_id)
            try:
                await websocket.close(code=1011)
            except Exception:
                pass
