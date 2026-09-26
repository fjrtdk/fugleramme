# US-006 — Backend Detection Engine

## User story

As the system, I want the backend to receive audio chunks from connected clients, run them through the BirdNET TFLite model locally, and push detection results back to clients in real time, so that the display can show detected species without any cloud dependency.

## Acceptance criteria

1. The backend exposes a WebSocket endpoint (`/ws/audio`) that accepts binary audio frames from authenticated clients (one frame = 1 second of 16 kHz mono PCM, 32 KB).
2. Authentication is enforced on the WebSocket handshake: unauthenticated connections are rejected with a 4001 close code before any audio is processed.
3. Received audio frames are buffered until enough contiguous audio is available to run one BirdNET inference pass (BirdNET requires 3-second segments; the buffer collects 3 frames before inference).
4. The BirdNET TFLite model is loaded once at server start from a local path; it is not re-loaded per request or per connection.
5. Inference runs in a thread or process pool so that the WebSocket event loop is not blocked; audio frames continue to be received during inference.
6. Each inference pass produces zero or more detections. A detection is a `{species_code, common_name, scientific_name, confidence}` tuple.
7. Only detections with a confidence score ≥ 0.5 are forwarded to clients (threshold is a configurable constant).
8. For each qualifying detection, the backend checks whether a matching vintage illustration exists in `assets/artwork/` by `species_code`. If no illustration exists, the detection is still forwarded but includes `"illustration": null` so the frontend can handle it gracefully.
9. Detection results are pushed to the originating client over the same WebSocket connection as a JSON message: `{"type": "detection", "detections": [...]}`.
10. A single inference pass must complete in under 3 seconds on a 2020-era laptop CPU (measured on the development machine); if it does not, the backend logs a warning and proceeds without dropping frames.
11. The backend handles client disconnects cleanly: buffered audio for a disconnected client is discarded and no further inference is scheduled for that client.
12. The backend exposes a health endpoint (`GET /health`) that returns `{"status": "ok"}` when the TFLite model is loaded and the service is ready, used by the Infra layer for readiness checks.
13. All inference errors (model exceptions, malformed audio) are caught, logged with a structured log entry, and result in a `{"type": "error", "message": "..."}` WebSocket message to the client rather than a server crash.

## Non-goals

- Cloud-based species identification API (explicitly excluded — all inference is local).
- BirdNET model training, fine-tuning, or retraining.
- Multi-model ensemble or fallback model.
- Storing raw audio frames in the database or on disk.
- Serving detections to multiple clients from a single audio stream (each client sends their own audio).
- Geographic filtering of detections by location.

## Owner

`@Backend` (WebSocket server, audio buffer, BirdNET TFLite inference, detection push, health endpoint)

> **Note to Manager:** `@Contract` must define the WebSocket message schemas (audio input frame, detection output, error message) and the auth handshake mechanism before `@Backend` can implement this story. `@Content` must supply the illustration file-naming convention so `@Backend` can implement AC 8 correctly.
