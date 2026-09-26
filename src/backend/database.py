"""Async SQLite connection management and schema initialisation."""

import aiosqlite
from src.backend.config import settings


async def _apply_pragmas(db: aiosqlite.Connection) -> None:
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute("PRAGMA foreign_keys = ON")
    await db.execute("PRAGMA synchronous = NORMAL")


async def get_db():
    """FastAPI dependency: yields an aiosqlite.Connection with required pragmas set."""
    db = await aiosqlite.connect(settings.database_path)
    db.row_factory = aiosqlite.Row
    try:
        await _apply_pragmas(db)
        yield db
    finally:
        await db.close()


async def init_db() -> None:
    """Create tables and indices idempotently on application start."""
    async with aiosqlite.connect(settings.database_path) as db:
        db.row_factory = aiosqlite.Row
        await _apply_pragmas(db)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id               TEXT NOT NULL PRIMARY KEY,
                username         TEXT NOT NULL,
                email            TEXT NOT NULL UNIQUE,
                password_hash    TEXT NOT NULL,
                onboarding_seen  INTEGER NOT NULL DEFAULT 0,
                created_at       TEXT NOT NULL,
                updated_at       TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email    ON users (email)
        """)
        await db.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username)
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS detections (
                id                  TEXT NOT NULL PRIMARY KEY,
                user_id             TEXT NOT NULL,
                species_common      TEXT NOT NULL,
                species_scientific  TEXT NOT NULL,
                confidence          REAL NOT NULL,
                illustration_path   TEXT,
                detected_at         TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_detections_user_detected
            ON detections (user_id, detected_at DESC)
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS species (
                common_name       TEXT NOT NULL PRIMARY KEY,
                scientific_name   TEXT NOT NULL UNIQUE,
                body_mass_g       REAL,
                illustration_path TEXT
            )
        """)
        await db.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_species_scientific
            ON species (scientific_name)
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id          TEXT    NOT NULL PRIMARY KEY,
                display_mode     TEXT    NOT NULL DEFAULT 'collage',
                margin_percent   INTEGER NOT NULL DEFAULT 4,
                lookback_window  TEXT    NOT NULL DEFAULT '24h',
                max_species      INTEGER          DEFAULT 40,
                species_sort     TEXT    NOT NULL DEFAULT 'most_heard',
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)

        await db.commit()
