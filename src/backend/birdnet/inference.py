"""BirdNET inference pipeline.

Takes the three 32 768-byte PCM frames that the audio WebSocket accumulates,
resamples from 16 kHz to 48 kHz (BirdNET's native rate), runs TFLite
inference, and returns the detections above the confidence threshold.

Buffer arithmetic
─────────────────
  3 frames × 32 768 bytes ÷ 2 bytes per int16 sample = 49 152 samples @ 16 kHz
  Target: 144 000 samples @ 48 kHz  (3 s × 48 000 Hz)

  The upsampling ratio is 144 000 / 49 152 = ~2.93, so integer repeat is
  not exact.  We use numpy.interp for linear resampling — no scipy needed,
  correct output length guaranteed.
"""

import logging
from dataclasses import dataclass

import numpy as np

from src.backend.birdnet.model import BirdNetState

logger = logging.getLogger("fugleramme.birdnet.inference")

CONFIDENCE_THRESHOLD = 0.5
_TARGET_SAMPLES = 144_000       # 3 s × 48 000 Hz — BirdNET input width
_MAX_INT16 = 32_768.0           # normalisation divisor


@dataclass
class Detection:
    """A single species detection produced by one inference pass."""

    common_name: str
    scientific_name: str
    species_code: str
    confidence: float


def run_inference(
    buffer: list[bytes],
    state: BirdNetState,
    top_n: int = 10,
) -> list[Detection]:
    """Run BirdNET inference on a 3-frame PCM buffer.

    Args:
        buffer: Exactly 3 binary frames, each 32 768 bytes
                (16 kHz, PCM 16-bit signed little-endian, mono).
        state:  Loaded :class:`BirdNetState`.
        top_n:  Maximum species to consider (sorted by confidence desc,
                applied *before* the threshold filter so the function still
                returns all species above threshold up to top_n).

    Returns:
        List of :class:`Detection` objects with ``confidence ≥ 0.5``,
        sorted by confidence descending.  Empty list on silence or errors.
    """
    if not buffer:
        return []

    try:
        # ── Decode PCM int16 (little-endian) ──────────────────────────────────
        raw = b"".join(buffer)
        audio_int16 = np.frombuffer(raw, dtype="<i2")  # explicit little-endian

        # ── Guard: silence / empty signal ─────────────────────────────────────
        peak = np.max(np.abs(audio_int16))
        if peak == 0:
            return []

        # ── Resample 16 kHz → 48 kHz via linear interpolation ─────────────────
        n_src = len(audio_int16)
        x_src = np.linspace(0.0, 1.0, n_src, endpoint=False)
        x_dst = np.linspace(0.0, 1.0, _TARGET_SAMPLES, endpoint=False)
        audio_48k = np.interp(x_dst, x_src, audio_int16.astype(np.float32))

        # ── Normalise float32 to [-1, 1] ──────────────────────────────────────
        audio_norm = (audio_48k / _MAX_INT16).astype(np.float32)
        # Clip in case of minor float overflow from interpolation
        audio_norm = np.clip(audio_norm, -1.0, 1.0)

        # ── TFLite inference ──────────────────────────────────────────────────
        input_tensor = audio_norm.reshape(1, _TARGET_SAMPLES)
        interp = state.interpreter
        interp.set_tensor(state.input_index, input_tensor)
        interp.invoke()

        # Output shape: (1, n_classes)
        scores: np.ndarray = interp.get_tensor(state.output_index)[0]

        # ── Map scores → labels ───────────────────────────────────────────────
        n_classes = int(scores.shape[0])
        n_labels = len(state.labels)
        if n_classes != n_labels:
            logger.warning(
                "Class/label count mismatch: model outputs %d but labels has %d",
                n_classes,
                n_labels,
            )

        usable = min(n_classes, n_labels)
        top_indices = np.argsort(scores[:usable])[::-1][:top_n]

        detections: list[Detection] = []
        for idx in top_indices:
            conf = float(scores[idx])
            if conf < CONFIDENCE_THRESHOLD:
                break   # sorted descending — nothing below this will qualify
            label = state.labels[idx]
            detections.append(
                Detection(
                    common_name=label.common_name,
                    scientific_name=label.scientific_name,
                    species_code=label.species_code,
                    confidence=round(conf, 4),
                )
            )

        return detections

    except Exception:
        logger.exception("Inference error (buffer len=%d)", len(buffer))
        return []
