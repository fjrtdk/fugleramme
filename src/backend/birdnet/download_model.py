"""Download BirdNET model and labels from Zenodo (official canonical source).

Run as:
    uv run python -m src.backend.birdnet.download_model

Files are saved to assets/model/ (configurable via BIRDNET_MODEL_DIR).
The script is idempotent — existing files are not re-downloaded.

Source: https://zenodo.org/records/15050749
  BirdNET_v2.4_tflite.zip contains:
    audio-model.tflite  → BirdNET_GLOBAL_6K_V2.4_Model_FP32.tflite
    en_us.txt           → BirdNET_GLOBAL_6K_V2.4_Labels.txt
"""

import io
import os
import sys
import urllib.request
import zipfile
from pathlib import Path

_MODEL_DIR = Path(os.getenv("BIRDNET_MODEL_DIR", "assets/model"))

_MODEL_FILENAME = "BirdNET_GLOBAL_6K_V2.4_Model_FP32.tflite"
_LABELS_FILENAME = "BirdNET_GLOBAL_6K_V2.4_Labels.txt"

# Zenodo DOI for BirdNET model v2.4 (https://zenodo.org/records/15050749)
_TFLITE_ZIP_URL = (
    "https://zenodo.org/records/15050749/files/BirdNET_v2.4_tflite.zip?download=1"
)

# Names inside the zip archive
_ZIP_MODEL_NAME = "audio-model.tflite"
_ZIP_LABELS_NAME = "en_us.txt"


# ── Progress reporter ────────────────────────────────────────────────────────


class _Reporter:
    """urllib reporthook that prints a simple progress bar."""

    def __init__(self, filename: str) -> None:
        self._filename = filename
        self._last_pct = -1

    def __call__(self, block: int, block_size: int, total_size: int) -> None:
        if total_size <= 0:
            return
        pct = min(100, int(block * block_size * 100 / total_size))
        if pct != self._last_pct and pct % 10 == 0:
            print(f"  {self._filename}: {pct}%", end="\r", flush=True)
            self._last_pct = pct


# ── Core logic ───────────────────────────────────────────────────────────────


def _extract_from_zip(zip_bytes: bytes, model_dir: Path) -> None:
    """Extract the model and English labels from the in-memory zip."""
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names_in_zip = zf.namelist()

        # Locate the model file (may be at root or in a subdirectory)
        model_entry = next(
            (n for n in names_in_zip if n.endswith(_ZIP_MODEL_NAME)),
            None,
        )
        labels_entry = next(
            (n for n in names_in_zip if n.endswith(_ZIP_LABELS_NAME)),
            None,
        )

        if model_entry is None:
            raise RuntimeError(
                f"'{_ZIP_MODEL_NAME}' not found in zip. "
                f"Available files: {names_in_zip}"
            )
        if labels_entry is None:
            raise RuntimeError(
                f"'{_ZIP_LABELS_NAME}' not found in zip. "
                f"Available files: {names_in_zip}"
            )

        dest_model = model_dir / _MODEL_FILENAME
        dest_labels = model_dir / _LABELS_FILENAME

        if not dest_model.exists():
            print(f"  Extracting {_ZIP_MODEL_NAME} → {dest_model.name}")
            dest_model.write_bytes(zf.read(model_entry))
            size_mb = dest_model.stat().st_size / 1_048_576
            print(f"  {dest_model.name}: done ({size_mb:.1f} MB)       ")

        if not dest_labels.exists():
            print(f"  Extracting {_ZIP_LABELS_NAME} → {dest_labels.name}")
            dest_labels.write_bytes(zf.read(labels_entry))
            size_kb = dest_labels.stat().st_size / 1024
            print(f"  {dest_labels.name}: done ({size_kb:.1f} kB)       ")


def main() -> None:
    _MODEL_DIR.mkdir(parents=True, exist_ok=True)

    model_present = (_MODEL_DIR / _MODEL_FILENAME).exists()
    labels_present = (_MODEL_DIR / _LABELS_FILENAME).exists()

    if model_present and labels_present:
        print(f"BirdNET assets already present in {_MODEL_DIR}/ — nothing to do.")
        return

    print(f"Downloading BirdNET v2.4 TFLite bundle to {_MODEL_DIR}/")
    print(f"  ← {_TFLITE_ZIP_URL}")

    reporter = _Reporter("BirdNET_v2.4_tflite.zip")
    tmp_zip = _MODEL_DIR / "BirdNET_v2.4_tflite.zip.part"
    try:
        urllib.request.urlretrieve(_TFLITE_ZIP_URL, tmp_zip, reporter)
        print()  # newline after progress bar
        zip_bytes = tmp_zip.read_bytes()
    except Exception as exc:
        tmp_zip.unlink(missing_ok=True)
        raise RuntimeError(
            f"Failed to download BirdNET zip from {_TFLITE_ZIP_URL}: {exc}"
        ) from exc
    finally:
        tmp_zip.unlink(missing_ok=True)

    _extract_from_zip(zip_bytes, _MODEL_DIR)

    print(
        "\nDone.  Start the app with:\n"
        "  uv run uvicorn src.backend.main:app --reload"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"\nError: {exc}", file=sys.stderr)
        sys.exit(1)
