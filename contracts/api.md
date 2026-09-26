# contracts/api.md — Fugleramme REST API Contract

**Version:** v1  
**Base URL:** `/api/v1`  
**Content-Type:** `application/json` (all requests and responses unless stated otherwise)  
**Auth:** JWT Bearer token in `Authorization: Bearer <token>` header, or via `httpOnly` cookie `fugleramme_session`. Protected endpoints return `401` when no valid token is present.

---

## Versioning Strategy

- All endpoints are prefixed with `/api/v1`.
- Breaking changes (field removal, type change, semantic change) require a new version prefix (`/api/v2`).
- Additive changes (new optional fields, new endpoints) are made in-place without a version bump.
- The current version is `v1`. No other version exists at the time of writing.

---

## Common Error Shape

Every error response uses this envelope:

```json
{
  "error": {
    "code": "SNAKE_CASE_CODE",
    "message": "Human-readable explanation."
  }
}
```

Error codes are documented per endpoint. HTTP status codes follow standard semantics.

---

## Auth Endpoints

### POST /api/v1/auth/register

Create a new user account.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "plaintext-password",
  "username": "optional-display-name"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `email` | string | yes | valid RFC 5321 email, max 254 chars |
| `password` | string | yes | min 8 chars, max 128 chars |
| `username` | string | no | 1–64 chars, alphanumeric + hyphens/underscores; defaults to local-part of email if omitted |

**Response `201 Created`:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "display-name",
    "onboarding_seen": false,
    "created_at": "2024-01-01T00:00:00Z"
  },
  "token": "eyJ..."
}
```

The `token` is a JWT. The server also sets a `fugleramme_session` httpOnly cookie with the same token.

**Error responses:**

| Status | Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing required field or field fails constraint |
| `409` | `EMAIL_ALREADY_EXISTS` | An account with this email already exists |

**`409` example:**
```json
{
  "error": {
    "code": "EMAIL_ALREADY_EXISTS",
    "message": "An account with this email already exists."
  }
}
```

---

### POST /api/v1/auth/login

Authenticate an existing user and issue a JWT.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "plaintext-password"
}
```

| Field | Type | Required |
|---|---|---|
| `email` | string | yes |
| `password` | string | yes |

**Response `200 OK`:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "display-name",
    "onboarding_seen": true,
    "created_at": "2024-01-01T00:00:00Z"
  },
  "token": "eyJ..."
}
```

The server also sets a `fugleramme_session` httpOnly cookie.

**Error responses:**

| Status | Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing field |
| `401` | `INVALID_CREDENTIALS` | Email not found or password incorrect — no detail about which |

**`401` example:**
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password."
  }
}
```

---

### POST /api/v1/auth/logout

Invalidate the current session. Clears the `fugleramme_session` cookie.

**Auth required:** yes  
**Request body:** none

**Response `204 No Content`:** empty body.

**Error responses:**

| Status | Code | Condition |
|---|---|---|
| `401` | `UNAUTHENTICATED` | No valid session token present |

---

### POST /api/v1/auth/refresh

Exchange a valid (non-expired) JWT for a new one with a refreshed expiry.

**Auth required:** yes (existing token, may be passed in header or cookie)  
**Request body:** none

**Response `200 OK`:**
```json
{
  "token": "eyJ..."
}
```

Also rotates the `fugleramme_session` cookie.

**Error responses:**

| Status | Code | Condition |
|---|---|---|
| `401` | `UNAUTHENTICATED` | Token missing, invalid, or expired |

---

### GET /api/v1/auth/me

Return the current authenticated user's profile.

**Auth required:** yes

**Response `200 OK`:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "display-name",
  "onboarding_seen": false,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Error responses:**

| Status | Code | Condition |
|---|---|---|
| `401` | `UNAUTHENTICATED` | No valid session |

---

## User Endpoints

### PATCH /api/v1/users/me

Update the current user's profile. All fields are optional; only provided fields are updated (partial update semantics).

**Auth required:** yes

**Request body:**
```json
{
  "username": "new-name",
  "onboarding_seen": true
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `username` | string | no | 1–64 chars, alphanumeric + hyphens/underscores |
| `onboarding_seen` | boolean | no | `true` marks onboarding complete; cannot be set back to `false` via this endpoint |

**Response `200 OK`:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "new-name",
  "onboarding_seen": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-02T00:00:00Z"
}
```

**Error responses:**

| Status | Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Field fails constraint |
| `401` | `UNAUTHENTICATED` | No valid session |

---

## Detection Endpoints

### GET /api/v1/detections

Return recent detections for the current user, ordered newest first.

**Auth required:** yes

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `50` | Max results to return. Range: 1–200. |
| `before` | ISO 8601 datetime | none | Return only detections with `detected_at` strictly before this value (cursor-based pagination). |

**Response `200 OK`:**
```json
{
  "detections": [
    {
      "id": "uuid",
      "species_common": "Common Blackbird",
      "species_scientific": "Turdus merula",
      "confidence": 0.87,
      "illustration_path": "/assets/artwork/turdus_merula.png",
      "detected_at": "2024-06-01T14:23:00Z"
    }
  ],
  "next_cursor": "2024-06-01T14:22:00Z"
}
```

`next_cursor` is the `detected_at` value to pass as `before` for the next page. It is `null` when no further results exist.

`illustration_path` is `null` when no illustration exists for the species.

**Error responses:**

| Status | Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | `limit` out of range or `before` not a valid datetime |
| `401` | `UNAUTHENTICATED` | No valid session |

---

### GET /api/v1/species

Return the list of all known species with their illustration metadata and body-mass data. Used by the frontend to pre-load illustration sizing data.

**Auth required:** yes

**Query parameters:** none

**Response `200 OK`:**
```json
{
  "species": [
    {
      "common_name": "Common Blackbird",
      "scientific_name": "Turdus merula",
      "body_mass_g": 100,
      "illustration_path": "/assets/artwork/turdus_merula.png"
    }
  ]
}
```

`illustration_path` is `null` when no illustration exists for the species.  
`body_mass_g` is a positive number (grams). It is `null` when body mass data is unavailable.

**Error responses:**

| Status | Code | Condition |
|---|---|---|
| `401` | `UNAUTHENTICATED` | No valid session |

---

## Settings Endpoints

### GET /api/v1/settings

Return the current authenticated user's display settings. If the user has never saved settings, server-side defaults are returned.

**Auth required:** yes

**Response `200 OK`:**
```json
{
  "display_mode": "collage",
  "margin_percent": 4,
  "lookback_window": "24h",
  "max_species": 40,
  "species_sort": "most_heard"
}
```

| Field | Type | Notes |
|---|---|---|
| `display_mode` | `"collage"` \| `"latest_bird"` \| `"newest_arrival"` | Active display mode |
| `margin_percent` | integer | 0–20; percentage of the short viewport side used as margin |
| `lookback_window` | `"15m"` \| `"1h"` \| `"6h"` \| `"24h"` \| `"all"` | Collage lookback and Newest Arrival novelty window |
| `max_species` | integer \| null | Max species shown in Collage; `null` means show all |
| `species_sort` | `"most_heard"` \| `"rarest_window"` \| `"rarest_all_time"` | Which species to retain when count exceeds `max_species` in Collage |

**Error responses:**

| Status | Code | Condition |
|---|---|---|
| `401` | `UNAUTHENTICATED` | No valid session |

---

### PUT /api/v1/settings

Replace the current authenticated user's display settings in full (full-replace semantics). All fields are required. Returns the saved settings.

**Auth required:** yes

**Request body:**
```json
{
  "display_mode": "collage",
  "margin_percent": 4,
  "lookback_window": "24h",
  "max_species": 40,
  "species_sort": "most_heard"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `display_mode` | string | yes | One of `"collage"`, `"latest_bird"`, `"newest_arrival"` |
| `margin_percent` | integer | yes | Integer 0–20 inclusive |
| `lookback_window` | string | yes | One of `"15m"`, `"1h"`, `"6h"`, `"24h"`, `"all"` |
| `max_species` | integer \| null | yes | Positive integer (≥ 1) or `null`. Zero is not valid |
| `species_sort` | string | yes | One of `"most_heard"`, `"rarest_window"`, `"rarest_all_time"` |

**Response `200 OK`:** the full saved settings object, identical in shape to the GET response.

**Validation rules:**

- `lookback_window`, `max_species`, and `species_sort` are stored regardless of the current `display_mode`. The server never strips collage-only fields when `display_mode` is not `"collage"`. The UI hides these controls in non-Collage modes (US-010 AC 12, 15, 17), but the server preserves the values so they are restored when the mode is switched back.
- `max_species` must be a positive integer (≥ 1) or `null`. `0` is a validation error.

**Error responses:**

| Status | Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Any field fails its constraint |
| `401` | `UNAUTHENTICATED` | No valid session |

**`400` example — invalid `display_mode`:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "display_mode must be one of: collage, latest_bird, newest_arrival."
  }
}
```

**`400` example — `margin_percent` out of range:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "margin_percent must be an integer between 0 and 20 inclusive."
  }
}
```

**`400` example — `max_species` zero:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "max_species must be a positive integer or null."
  }
}
```

**`400` example — invalid `lookback_window`:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "lookback_window must be one of: 15m, 1h, 6h, 24h, all."
  }
}
```

> **Side effect:** A successful `PUT /api/v1/settings` causes the server to push a `settings_changed` event to all open `/ws/detections` connections for the same authenticated user. See `contracts/websocket.md` §Channel 2 — `settings_changed` message.

---

## Health Endpoint

### GET /health

Returns the service readiness status. Not versioned; not auth-protected. Used by the infrastructure layer for readiness checks.

**Response `200 OK`:**
```json
{
  "status": "ok"
}
```

**Response `503 Service Unavailable`** (model not yet loaded or startup in progress):
```json
{
  "status": "starting"
}
```

---

## JWT Shape

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "iat": 1700000000,
  "exp": 1700086400
}
```

- Algorithm: `HS256`
- Expiry: 24 hours from issuance
- The secret key is an environment variable; it never appears in code, logs, or this contract.
- The cookie `fugleramme_session` is `httpOnly`, `SameSite=Strict`, `Secure` in production.
