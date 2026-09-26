"""FastAPI application entry point."""

import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.backend.config import settings
from src.backend.database import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("fugleramme")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database initialised.")

    # ── BirdNET model ─────────────────────────────────────────────────────────
    from src.backend.birdnet import load_birdnet, seed_species_if_empty  # noqa: PLC0415

    app.state.birdnet_load_error = None
    try:
        load_birdnet()
        logger.info("BirdNET model loaded.")
    except FileNotFoundError as exc:
        app.state.birdnet_load_error = str(exc)
        logger.warning("BirdNET model files missing — inference disabled: %s", exc)
        logger.warning(
            "Download them with: uv run python -m src.backend.birdnet.download_model"
        )
    except RuntimeError as exc:
        app.state.birdnet_load_error = str(exc)
        logger.warning("BirdNET backend unavailable — inference disabled: %s", exc)

    # ── Species seeding ───────────────────────────────────────────────────────
    import aiosqlite  # noqa: PLC0415

    try:
        async with aiosqlite.connect(settings.database_path) as db:
            await db.execute("PRAGMA journal_mode = WAL")
            await db.execute("PRAGMA foreign_keys = ON")
            await db.execute("PRAGMA synchronous = NORMAL")
            await seed_species_if_empty(db)
    except Exception:
        logger.exception("Species seeding failed (non-fatal)")

    logger.info("Fugleramme ready.")
    yield


app = FastAPI(
    title="Fugleramme API",
    version="1.0.0",
    lifespan=lifespan,
    # Disable default 422 in OpenAPI — we return 400 VALIDATION_ERROR instead.
    responses={422: {"description": "Not used"}},
)

# ── CORS ───────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request logging middleware ─────────────────────────────────────────────────


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    elapsed_ms = (time.monotonic() - start) * 1000
    logger.info("%s %s → %d (%.1f ms)", request.method, request.url.path, response.status_code, elapsed_ms)
    return response


# ── Exception handlers ─────────────────────────────────────────────────────────


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Pass through responses that already carry the contract error envelope.
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "ERROR", "message": str(exc.detail)}},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed."}},
    )


# ── Health ─────────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    from src.backend.birdnet import birdnet_state  # noqa: PLC0415

    return {"status": "ok", "birdnet": birdnet_state is not None}


@app.get("/health/birdnet")
async def health_birdnet(request: Request):
    from src.backend.birdnet import birdnet_state  # noqa: PLC0415
    from src.backend.birdnet.model import _DEFAULT_MODEL_DIR, MODEL_FILENAME  # noqa: PLC0415

    model_loaded = birdnet_state is not None
    labels = birdnet_state.labels if model_loaded else []

    return {
        "model_loaded": model_loaded,
        "model_path": str(_DEFAULT_MODEL_DIR / MODEL_FILENAME),
        "labels_loaded": bool(labels),
        "labels_count": len(labels),
        "error": getattr(request.app.state, "birdnet_load_error", None),
    }


# ── Routers ────────────────────────────────────────────────────────────────────

from src.backend.auth.router import router as auth_router  # noqa: E402
from src.backend.detections.router import router as detections_router  # noqa: E402
from src.backend.settings.router import router as settings_router  # noqa: E402
from src.backend.users.router import router as users_router  # noqa: E402
from src.backend.ws.audio import router as ws_audio_router  # noqa: E402
from src.backend.ws.detections_ws import router as ws_detections_router  # noqa: E402

app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(detections_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")
app.include_router(ws_audio_router)
app.include_router(ws_detections_router)

# ── Static files & SPA fallback ────────────────────────────────────────────────
# Must be registered LAST so API/WS routes take priority.
#
# The frontend dist directory is configured via FRONTEND_DIR (set in the Docker
# image) or defaults to "frontend_dist" relative to the working directory.

_FRONTEND_DIR = Path(settings.frontend_dir)
_FRONTEND_DIR_RESOLVED: Path | None = None
if _FRONTEND_DIR.exists():
    _FRONTEND_DIR_RESOLVED = _FRONTEND_DIR.resolve()
    logger.info("Serving frontend from %s", _FRONTEND_DIR_RESOLVED)
else:
    logger.warning("Frontend dir not found (%s) — SPA serving disabled", _FRONTEND_DIR)


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    """Serve the SPA index.html for all unmatched paths, or static files when
    an exact match exists in the frontend dist directory.

    Paths starting with ``api/`` or ``ws/`` are explicitly rejected so that
    mistyped API calls receive a proper 404 rather than the SPA shell.
    """
    if full_path.startswith(("api/", "ws/")):
        raise HTTPException(status_code=404)

    if _FRONTEND_DIR_RESOLVED is None:
        raise HTTPException(status_code=404, detail="Frontend not available")

    # Guard against path traversal
    try:
        candidate = (_FRONTEND_DIR / full_path).resolve()
        if not str(candidate).startswith(str(_FRONTEND_DIR_RESOLVED)):
            raise HTTPException(status_code=404)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404)

    if candidate.is_file():
        return FileResponse(str(candidate))

    # SPA fallback: unknown paths (e.g. /settings, /login) get index.html
    index = _FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))

    raise HTTPException(status_code=404)
