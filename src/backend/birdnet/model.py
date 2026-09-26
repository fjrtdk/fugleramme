"""BirdNET TFLite model loader.

Loads the BirdNET_GLOBAL_6K_V2.4_Model_FP32.tflite interpreter and the
accompanying species-labels file.  Model directory is configurable via the
BIRDNET_MODEL_DIR environment variable (default: assets/model/).

TFLite backend priority:
  1. tflite_runtime        (pip install tflite-runtime>=2.14)
  2. tensorflow.lite       (pip install tensorflow)
  3. ai_edge_litert        (pip install ai-edge-litert   — Google's 2024 rename)

Install whichever is available on your platform.  On Python 3.11+ / macOS ARM,
ai-edge-litert is the most reliable choice if tflite-runtime wheels are absent.
"""

import logging
import os
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("fugleramme.birdnet.model")

# ── TFLite backend resolution ─────────────────────────────────────────────────

_tflite = None
_TFLITE_BACKEND = "none"

try:
    import tflite_runtime.interpreter as _tflite  # type: ignore[no-redef]
    _TFLITE_BACKEND = "tflite_runtime"
except ImportError:
    pass

if _tflite is None:
    try:
        import tensorflow.lite as _tflite  # type: ignore[no-redef,import-not-found]
        _TFLITE_BACKEND = "tensorflow"
    except ImportError:
        pass

if _tflite is None:
    try:
        import ai_edge_litert.interpreter as _tflite  # type: ignore[no-redef,import-not-found]
        _TFLITE_BACKEND = "ai_edge_litert"
    except ImportError:
        pass

# ── Constants ─────────────────────────────────────────────────────────────────

_DEFAULT_MODEL_DIR = Path(os.getenv("BIRDNET_MODEL_DIR", "assets/model"))
MODEL_FILENAME = "BirdNET_GLOBAL_6K_V2.4_Model_FP32.tflite"
LABELS_FILENAME = "BirdNET_GLOBAL_6K_V2.4_Labels.txt"


# ── Data types ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SpeciesLabel:
    """One entry from the BirdNET labels file."""

    scientific_name: str   # e.g. "Turdus merula"
    common_name: str       # e.g. "Common Blackbird"
    species_code: str      # e.g. "comblk" — derived from common name


@dataclass
class BirdNetState:
    """Loaded TFLite interpreter plus the species label list."""

    interpreter: object
    labels: list[SpeciesLabel]
    input_index: int
    output_index: int


# ── Helpers ───────────────────────────────────────────────────────────────────


def _species_code(common_name: str) -> str:
    """Derive a short species code from the English common name.

    Algorithm: first 3 chars of word 1 + first 3 chars of last word, lowercase.
    Single-word names: first 6 chars.

    Examples:
        "Common Blackbird"  → "combla"
        "Great Tit"         → "greti"
        "Eurasian Jay"      → "eurajay"  (capped at 6)
    """
    words = common_name.split()
    if not words:
        return "unkn"
    if len(words) == 1:
        return common_name[:6].lower()
    code = (words[0][:3] + words[-1][:3]).lower()
    return code


# ── Public API ────────────────────────────────────────────────────────────────


def load_labels(model_dir: Path = _DEFAULT_MODEL_DIR) -> list[SpeciesLabel]:
    """Parse the BirdNET labels file into a list of SpeciesLabel objects.

    Each line has the format: ``{Scientific Name}_{Common Name}``
    where the underscore separates the two fields (first occurrence only).
    """
    labels_path = model_dir / LABELS_FILENAME
    if not labels_path.exists():
        raise FileNotFoundError(
            f"BirdNET labels file not found: {labels_path}\n"
            "Run: uv run python -m src.backend.birdnet.download_model"
        )

    labels: list[SpeciesLabel] = []
    with open(labels_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            if "_" in line:
                scientific, common = line.split("_", 1)
                scientific = scientific.strip()
                common = common.strip()
            else:
                scientific = line
                common = line
            labels.append(
                SpeciesLabel(
                    scientific_name=scientific,
                    common_name=common,
                    species_code=_species_code(common),
                )
            )

    logger.info(
        "Loaded %d species labels from %s (backend=%s)",
        len(labels),
        labels_path.name,
        _TFLITE_BACKEND,
    )
    return labels


def load_model(model_dir: Path = _DEFAULT_MODEL_DIR) -> BirdNetState:
    """Initialise the TFLite interpreter and load the labels file.

    Raises:
        RuntimeError: No TFLite backend is importable.
        FileNotFoundError: Model or labels file missing from model_dir.
    """
    if _tflite is None:
        raise RuntimeError(
            "No TFLite backend found.  Install one of:\n"
            "  uv add tflite-runtime      # Python ≤3.10 / Linux x86\n"
            "  uv add ai-edge-litert      # Python 3.11+ / macOS ARM  (recommended)\n"
            "  uv add tensorflow          # full TF (large, slower)"
        )

    model_path = model_dir / MODEL_FILENAME
    if not model_path.exists():
        raise FileNotFoundError(
            f"BirdNET model not found: {model_path}\n"
            "Run: uv run python -m src.backend.birdnet.download_model"
        )

    interpreter = _tflite.Interpreter(model_path=str(model_path))
    interpreter.allocate_tensors()

    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    input_index = input_details[0]["index"]
    output_index = output_details[0]["index"]

    labels = load_labels(model_dir)

    logger.info(
        "BirdNET model loaded: %s | input=%s output=%s | backend=%s",
        model_path.name,
        input_details[0]["shape"],
        output_details[0]["shape"],
        _TFLITE_BACKEND,
    )
    return BirdNetState(
        interpreter=interpreter,
        labels=labels,
        input_index=input_index,
        output_index=output_index,
    )
