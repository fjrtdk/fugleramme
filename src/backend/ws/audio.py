"""WebSocket audio upstream: /ws/audio

Accepts binary PCM frames from the client (16 kHz, PCM int16 mono, 32 000 bytes
each), accumulates 3-frame buffers, runs BirdNET TFLite inference, persists
detections to Supabase, and broadcasts results to /ws/detections clients.

Authentication is via query-parameter JWT.  Invalid token → close 4001.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import aiosqlite
import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError

from src.backend.auth.jwt_utils import (
    decode_token,
    fetch_confidence_threshold,
    validate_supabase_token,
)
from src.backend import birdnet as birdnet_mod
from src.backend.birdnet.inference import Detection, run_inference
from src.backend.config import settings
from src.backend.ws.manager import manager

router = APIRouter(tags=["ws"])
logger = logging.getLogger("fugleramme.ws.audio")

_FRAME_BYTES = 32_000   # 1 s × 16 000 samples × 2 bytes  (see contracts/websocket.md)
_BUFFER_FRAMES = 3      # 3 s inference window


# ── Helpers ───────────────────────────────────────────────────────────────────


def _error_msg(code: str, message: str) -> str:
    return json.dumps({"type": "error", "code": code, "message": message})


def _illustration_path(_scientific_name: str) -> None:
    """Artwork paths are resolved client-side from the current style setting.

    The bundled illustrations live under /artwork/{style}/birds/{kebab}.webp;
    the frontend already maps BirdNET taxonomy and checks file existence.
    Returning None lets the display layer pick the correct path.
    """
    return None


async def _apply_pragmas(db: aiosqlite.Connection) -> None:
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute("PRAGMA foreign_keys = ON")
    await db.execute("PRAGMA synchronous = NORMAL")


async def _save_detection_to_supabase(
    user_id: str, det: Detection, token: str
) -> None:
    """Persist a single detection to Supabase public.detections via PostgREST.

    Errors are logged and swallowed; the caller must not await this on the
    real-time inference path.
    """
    payload = {
        "user_id": user_id,
        "species_common": det.common_name,
        "species_scientific": det.scientific_name,
        "confidence": det.confidence,
        "illustration_path": None,
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }
    base_url = (settings.supabase_url or "").rstrip("/")
    if not base_url:
        logger.warning("SUPABASE_URL is not configured; detection not persisted")
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{base_url}/rest/v1/detections",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                },
                json=payload,
            )
            resp.raise_for_status()
    except httpx.HTTPError:
        logger.exception("Supabase detection insert failed for %s", det.scientific_name)


# ── Inference + persistence + broadcast ───────────────────────────────────────


async def _process_buffer(
    websocket: WebSocket,
    db: aiosqlite.Connection,
    user_id: str,
    buffer: list[bytes],
    token: str,
    confidence_threshold: float = 0.5,
) -> None:
    """Run one inference cycle on the 3-frame buffer.

    1. Runs BirdNET inference.
    2. For each detection ≥ 0.5 confidence:
       a. Resolves illustration path.
       b. Persists the detection to Supabase (fire-and-forget).
    3. Builds the detection message per contracts/websocket.md.
    4. Sends the message back on the audio WebSocket.
    5. Broadcasts the same message to all /ws/detections clients for this user.
    """
    logger.info(
        "_process_buffer entry user=%s frames=%d model_loaded=%s",
        user_id,
        len(buffer),
        birdnet_mod.birdnet_state is not None,
    )

    if birdnet_mod.birdnet_state is None:
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
        detections = run_inference(
            buffer, birdnet_mod.birdnet_state, confidence_threshold=confidence_threshold
        )
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

        # Persist to Supabase without blocking the inference loop
        asyncio.create_task(_save_detection_to_supabase(user_id, det, token))

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

    user_token = token or ""

    logger.info("audio connected user=%s", user_id)

    scheme = "https" if websocket.url.scheme == "wss" else "http"
    origin = f"{scheme}://{websocket.url.netloc}"
    confidence_threshold = 0.5
    if token:
        confidence_threshold = await fetch_confidence_threshold(token, origin)
    logger.info("audio user=%s confidence_threshold=%.2f", user_id, confidence_threshold)

    async with aiosqlite.connect(settings.database_path) as db:
        await _apply_pragmas(db)
        db.row_factory = aiosqlite.Row

        buffer: list[bytes] = []

        try:
            while True:
                data = await websocket.receive_bytes()
                logger.info("audio frame received user=%s bytes=%d", user_id, len(data))

                if len(data) != _FRAME_BYTES:
                    logger.info(
                        "audio frame size invalid user=%s expected=%d got=%d",
                        user_id,
                        _FRAME_BYTES,
                        len(data),
                    )
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
                    await _process_buffer(
                        websocket, db, user_id, buffer, user_token, confidence_threshold
                    )
                    buffer.clear()

        except WebSocketDisconnect:
            logger.info("audio disconnected user=%s", user_id)
        except Exception:
            logger.exception("audio error user=%s", user_id)
            try:
                await websocket.close(code=1011)
            except Exception:
                pass
