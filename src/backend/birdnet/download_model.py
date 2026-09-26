"""Download BirdNET model and labels from the official BirdNET-Analyzer repository.

Run as:
    uv run python -m src.backend.birdnet.download_model

Files are saved to assets/model/ (configurable via BIRDNET_MODEL_DIR).
The script is idempotent — existing files are not re-downloaded.

Source: https://github.com/kahst/BirdNET-Analyzer
"""

import os
import sys
import urllib.request
from pathlib import Path

_MODEL_DIR = Path(os.getenv("BIRDNET_MODEL_DIR", "assets/model"))

_MODEL_FILENAME = "BirdNET_GLOBAL_6K_V2.4_Model_FP32.tflite"
_LABELS_FILENAME = "BirdNET_GLOBAL_6K_V2.4_Labels.txt"

# Raw GitHub URLs for BirdNET-Analyzer main branch.
# If a URL returns 404, check the repository for the current path and update here.
_BASE_URL = (
    "https://github.com/kahst/BirdNET-Analyzer/raw/main"
    "/birdnet_analyzer/checkpoints/V2.4"
)

_DOWNLOADS: dict[str, str] = {
    _MODEL_FILENAME: f"{_BASE_URL}/{_MODEL_FILENAME}",
    _LABELS_FILENAME: f"{_BASE_URL}/{_LABELS_FILENAME}",
}


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


def _download_file(url: str, dest: Path) -> None:
    """Download url to dest, printing progress.  Removes partial file on error."""
    reporter = _Reporter(dest.name)
    tmp = dest.with_suffix(dest.suffix + ".part")
    try:
        urllib.request.urlretrieve(url, tmp, reporter)
        tmp.rename(dest)
        size_mb = dest.stat().st_size / 1_048_576
        print(f"  {dest.name}: done ({size_mb:.1f} MB)       ")
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"Failed to download {dest.name} from {url}: {exc}") from exc


def main() -> None:
    _MODEL_DIR.mkdir(parents=True, exist_ok=True)

    missing = {
        name: url
        for name, url in _DOWNLOADS.items()
        if not (_MODEL_DIR / name).exists()
    }

    if not missing:
        print(f"BirdNET assets already present in {_MODEL_DIR}/ — nothing to do.")
        return

    print(f"Downloading {len(missing)} file(s) to {_MODEL_DIR}/")
    for name, url in missing.items():
        print(f"  {name}")
        print(f"  ← {url}")
        _download_file(url, _MODEL_DIR / name)

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
