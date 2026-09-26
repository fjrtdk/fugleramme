# contracts/websocket.md — Fugleramme WebSocket Protocol Contract

**Version:** v1

This document defines both WebSocket channels: the audio upstream (client → server) used for live microphone streaming, and the detection downstream (server → client) used for real-time detection pushes.

---

## Authentication

All WebSocket connections require a valid JWT.

The token is passed as a query parameter on the initial HTTP upgrade request:

```
ws://host/ws/audio?token=eyJ...
ws://host/ws/detections?token=eyJ...
```

The server validates the token **before** the WebSocket upgrade completes. An invalid or missing token causes the upgrade to be rejected with HTTP `401`. A token that is valid but expires after the connection is established does not automatically close the connection; the connection remains open until the client disconnects or the server restarts.

---

## Channel 1 — Audio Upstream

### Endpoint

```
/ws/audio
```

### Purpose

The client streams raw microphone audio to the backend. The backend buffers frames, runs BirdNET inference, and returns detection results over this same connection.

### Connection lifecycle

```
Client                          Server
  |                               |
  |--- HTTP GET /ws/audio ------->|
  |    ?token=eyJ...              |
  |<-- 101 Switching Protocols ---|  (token valid)
  |    OR                         |
  |<-- 401 Unauthorized ----------|  (token missing/invalid)
  |                               |
  |--- binary frame (32 000 bytes) ----->|
  |--- binary frame (32 000 bytes) ----->|
  |--- binary frame (32 000 bytes) ----->|
  |<-- JSON: detection result ----|  (after 3 frames buffered)
  |--- binary frame (32 000 bytes) ----->|
  ...
  |--- close (1000 Normal) ------>|  (user returns to dashboard)
  |<-- close (1000 Normal) -------|
```

### Audio frame format (client → server)

Each WebSocket message is a **binary frame** containing exactly one second of audio:

| Property | Value |
|---|---|
| Encoding | PCM, 16-bit signed integer, little-endian |
| Sample rate | 16 000 Hz |
| Channels | Mono (1 channel) |
| Frame duration | 1 second |
| Frame size | 16 000 samples × 2 bytes = **32 000 bytes** (1 second of 16 kHz mono 16-bit PCM) |

The frontend resamples from the device's native sample rate to 16 kHz before sending. Frames must be exactly 32 000 bytes; frames of any other size are discarded and the server sends an `error` message.

### Server message: detection result (server → client)

Sent after the server has buffered 3 consecutive frames (3 seconds of audio) and completed one BirdNET inference pass. May contain zero or more detections.

```json
{
  "type": "detection",
  "detections": [
    {
      "species_code": "comblk",
      "common_name": "Common Blackbird",
      "scientific_name": "Turdus merula",
      "confidence": 0.87,
      "illustration_path": "/assets/artwork/turdus_merula.png",
      "timestamp": "2024-06-01T14:23:00Z"
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | `"detection"` | Discriminant field; always `"detection"` for this message |
| `detections` | array | Zero or more items. Empty array means inference ran but no species met the confidence threshold |
| `detections[].species_code` | string | BirdNET species code (e.g. `"comblk"`) |
| `detections[].common_name` | string | English common name |
| `detections[].scientific_name` | string | Binomial scientific name |
| `detections[].confidence` | number | Confidence score `[0.5, 1.0]`; only detections ≥ 0.5 are forwarded |
| `detections[].illustration_path` | string \| null | Server-relative path to the illustration asset, or `null` if no illustration exists for this species |
| `detections[].timestamp` | ISO 8601 string | UTC time the detection was produced |

### Server message: error (server → client)

Sent when the server encounters a recoverable error (malformed frame, inference failure, etc.).

```json
{
  "type": "error",
  "code": "INFERENCE_FAILED",
  "message": "BirdNET inference error: model returned unexpected output."
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | `"error"` | Discriminant field |
| `code` | string | Snake-case error code |
| `message` | string | Human-readable description |

**Error codes:**

| Code | Cause |
|---|---|
| `FRAME_SIZE_INVALID` | Binary frame was not exactly 32 000 bytes |
| `INFERENCE_FAILED` | BirdNET model raised an exception; buffered audio discarded |
| `AUDIO_FORMAT_INVALID` | Frame contained non-PCM or corrupt data |

These errors are non-fatal; the connection remains open and audio streaming continues. The server discards the affected buffer and starts accumulating fresh frames.

### WebSocket close codes (server-initiated)

| Code | Meaning |
|---|---|
| `4001` | Unauthenticated — token missing or invalid at handshake |
| `4002` | Token expired mid-session (reserved; not currently enforced, see §Auth) |
| `1011` | Internal server error — unexpected crash; client should reconnect |

### Reconnection (client responsibility)

The client uses exponential back-off with a maximum of 5 retries before surfacing an error to the user:

| Attempt | Delay before retry |
|---|---|
| 1 | 1 s |
| 2 | 2 s |
| 3 | 4 s |
| 4 | 8 s |
| 5 | 16 s |

After 5 failures, the client shows the mic-error state and stops retrying.

---

## Channel 2 — Detection Downstream

### Endpoint

```
/ws/detections
```

### Purpose

A read-only push channel. The server broadcasts detection events to all connected authenticated clients. Intended for scenarios where the display consumes detections produced by a different connected audio client. In the current phase, a client connects to both `/ws/audio` and `/ws/detections` and receives detections from both channels.

> **Note to `@Backend`:** In v1 this channel pushes only detections produced by the same authenticated user (matched by `user_id` from the JWT). Cross-user broadcasting is not in scope.

### Connection lifecycle

```
Client                          Server
  |                               |
  |--- HTTP GET /ws/detections --->|
  |    ?token=eyJ...              |
  |<-- 101 Switching Protocols ---|  (token valid)
  |    OR                         |
  |<-- 401 Unauthorized ----------|  (token missing/invalid)
  |                               |
  |<-- JSON: detection event -----|  (pushed on each detection)
  |<-- JSON: detection event -----|
  ...
  |--- close (1000 Normal) ------>|
  |<-- close (1000 Normal) --------|
```

The client sends nothing after the initial handshake. Any message sent by the client is ignored (the server does not close the connection on unexpected client messages in v1).

### Server message: detection event (server → client)

Identical shape to the `detection` message on `/ws/audio`:

```json
{
  "type": "detection",
  "detections": [
    {
      "species_code": "comblk",
      "common_name": "Common Blackbird",
      "scientific_name": "Turdus merula",
      "confidence": 0.87,
      "illustration_path": "/assets/artwork/turdus_merula.png",
      "timestamp": "2024-06-01T14:23:00Z"
    }
  ]
}
```

### Server message: settings_changed (server → client)

Pushed to all open `/ws/detections` connections for the authenticated user immediately after a successful `PUT /api/v1/settings`. The client must apply the new settings to the live display without a page reload (US-010 AC 3).

```json
{
  "type": "settings_changed",
  "settings": {
    "display_mode": "latest_bird",
    "margin_percent": 8,
    "lookback_window": "24h",
    "max_species": 40,
    "species_sort": "most_heard"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | `"settings_changed"` | Discriminant field |
| `settings` | object | Full settings object; same shape as the `GET /api/v1/settings` response |
| `settings.display_mode` | `"collage"` \| `"latest_bird"` \| `"newest_arrival"` | The newly active display mode |
| `settings.margin_percent` | integer | 0–20 |
| `settings.lookback_window` | `"15m"` \| `"1h"` \| `"6h"` \| `"24h"` \| `"all"` | Collage lookback and Newest Arrival novelty window |
| `settings.max_species` | integer \| null | Collage cap; `null` = show all |
| `settings.species_sort` | `"most_heard"` \| `"rarest_window"` \| `"rarest_all_time"` | Collage species retention rule |

The `settings_changed` event is **only sent to the same user's connections**. It is never broadcast cross-user.

### WebSocket close codes (server-initiated)

| Code | Meaning |
|---|---|
| `4001` | Unauthenticated |
| `1011` | Internal server error |

### Reconnection (client responsibility)

Same exponential back-off policy as `/ws/audio` (5 retries, delays: 1 s, 2 s, 4 s, 8 s, 16 s).

---

## Shared Constraints

- Both endpoints require TLS in production (`wss://`). Plain `ws://` is acceptable in local development only.
- Maximum concurrent connections per user: unbounded in v1 (a single user may have multiple browser tabs open).
- There is no ping/pong heartbeat defined at the application level; the server relies on the WebSocket protocol-level ping/pong. The client should handle `ping` frames with standard `pong` responses (handled automatically by browser WebSocket implementations).
