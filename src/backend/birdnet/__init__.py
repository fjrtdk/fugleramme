"""BirdNET package — public API and startup helpers.

Usage in main.py lifespan:
    from src.backend.birdnet import load_birdnet, seed_species_if_empty
    load_birdnet()                          # populates birdnet_state
    await seed_species_if_empty(db)         # seeds species table once

Usage in ws/audio.py:
    from src.backend.birdnet import birdnet_state
    from src.backend.birdnet.inference import run_inference
    detections = run_inference(buffer, birdnet_state)
"""

import logging
from pathlib import Path

import aiosqlite

from src.backend.birdnet.model import BirdNetState, SpeciesLabel, load_model

logger = logging.getLogger("fugleramme.birdnet")

# Module-level singleton populated by load_birdnet() at startup.
birdnet_state: BirdNetState | None = None


def load_birdnet() -> None:
    """Initialise the global BirdNET model state.

    Call once from the FastAPI lifespan handler.  Raises FileNotFoundError
    if the model files have not been downloaded yet.
    """
    global birdnet_state
    birdnet_state = load_model()


def _illustration_path(scientific_name: str) -> str | None:
    """Derive the server-relative illustration path from a scientific name.

    Returns the path string if the file exists on disk, else None.

    Convention (from contracts/schema.md):
        assets/artwork/{genus}_{species}.png
    """
    filename = scientific_name.lower().replace(" ", "_") + ".png"
    server_path = f"/assets/artwork/{filename}"
    # Only set the path if @Content has supplied the file.
    if Path(f"assets/artwork/{filename}").exists():
        return server_path
    return None


async def seed_species_if_empty(db: aiosqlite.Connection) -> None:
    """Seed the species table from BirdNET labels if the table is empty.

    Idempotent — does nothing when at least one row already exists.
    body_mass_g is set to NULL; @Content will supply body-mass data later.
    """
    if birdnet_state is None:
        logger.warning("seed_species_if_empty called before BirdNET was loaded; skipping")
        return

    cursor = await db.execute("SELECT COUNT(*) FROM species")
    (count,) = await cursor.fetchone()
    if count > 0:
        logger.debug("species table already has %d rows — skipping seed", count)
        return

    labels: list[SpeciesLabel] = birdnet_state.labels
    logger.info("Seeding species table from BirdNET labels (%d entries)…", len(labels))

    rows = [
        (
            label.common_name,
            label.scientific_name,
            None,                               # body_mass_g — @Content will fill
            _illustration_path(label.scientific_name),
        )
        for label in labels
    ]

    await db.executemany(
        """
        INSERT OR IGNORE INTO species (common_name, scientific_name, body_mass_g, illustration_path)
        VALUES (?, ?, ?, ?)
        """,
        rows,
    )
    await db.commit()
    logger.info("Species table seeded with %d rows", len(rows))
