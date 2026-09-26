# Privacy Assessment — Fugleramme

**Date:** 2026-09-26  
**Auditor:** @Compliance  
**Status:** BLOCK — critical gaps documented below.

---

## 1. PII Inventory

### 1.1 Stored PII

| Data item | Location | Format | Sensitivity | Notes |
|---|---|---|---|---|
| Email address | `users.email` (SQLite) | Plaintext, normalised to lowercase | Medium — uniquely identifies the user | Indexed; used for login lookup |
| Password hash | `users.password_hash` (SQLite) | bcrypt hash (plain-text never stored) | Low — hash only | bcrypt is a strong one-way hash; acceptable |
| Display name (username) | `users.username` (SQLite) | Plaintext | Low | Derived from email local-part if not supplied; may contain PII if user sets it to their real name |
| Detection history | `detections` table (SQLite) | Species name, confidence score, ISO 8601 timestamp, linked to `user_id` | Low — no explicit location, but timestamps + species create a behavioural profile | Accumulates indefinitely; linked to the user via FK |
| Display settings | `user_settings` table (SQLite) | Preferences only (display mode, margins, sort order) | Very low | No sensitive content |

Evidence: `contracts/schema.md` lines 15–176; `src/backend/ws/audio.py` (persistence logic, lines 97–133).

### 1.2 Transiently Processed Data — Audio

Audio is captured by the browser (`navigator.mediaDevices.getUserMedia`), downsampled to 16 kHz mono PCM, and streamed to `/ws/audio` as binary frames. The backend accumulates exactly 3 frames in a Python list (3 seconds of audio), runs BirdNET inference, then clears the buffer. **Audio frames are never written to disk, logged, or stored.** Only the inferred species metadata is persisted.

Evidence: `src/backend/ws/audio.py` lines 189–212 — `buffer.clear()` after each `_process_buffer` call; no `open()` or file-write call anywhere in the audio path; no `INSERT` of raw audio bytes.

**Assessment:** Audio processing complies with data minimisation. The only PII risk from audio is the possibility of voice identification from environmental recordings — this risk is mitigated by the fact that no audio is stored.

---

## 2. Lawful Basis

| Processing activity | Proposed lawful basis | Assessment |
|---|---|---|
| Storing email + password hash | **Contractual necessity** — required to provide the account-based service | Acceptable, but no privacy notice informs the user |
| Processing audio for bird detection | **Consent via browser mic permission prompt** | Partial — the browser prompt says "fugleramme wants to use your microphone" but provides no context about what the audio is used for |
| Storing detection history | **Contractual necessity** / **Legitimate interest** | Acceptable for service delivery, but no retention limit is defined |

**Gap:** No privacy policy or data processing notice exists. Users are not told what data is collected, for how long, or under what basis before they create an account or grant microphone access.

---

## 3. Retention Policy

**Finding: No retention policy exists anywhere in the codebase, contracts, or documentation.**

The `detections` table accumulates rows indefinitely. A user who runs Fugleramme continuously could accumulate hundreds of thousands of detection rows with no automatic expiry or user-initiated purge.

| Data item | Current retention | Required |
|---|---|---|
| User account (email, username, password hash) | Forever — no deletion mechanism | Must be deleteable on user request |
| Detection history | Forever — no TTL, no max rows, no purge | Policy must be documented; a deletion mechanism should exist |
| User settings | Forever (tied to account) | Deleted via `ON DELETE CASCADE` if account is deleted |
| Audio | Never stored | Compliant |

---

## 4. Deletion Mechanism

### 4.1 Account deletion — MISSING (blocking)

The API contract (`contracts/api.md`) defines no `DELETE /api/v1/users/me` endpoint. The schema includes `ON DELETE CASCADE` on `detections` and `user_settings`, so the database layer is prepared for cascade deletion, but **no API surface exposes this operation to the user.**

Under GDPR Article 17 ("right to erasure") and equivalent regulations in many jurisdictions, users must be able to request deletion of their personal data. The absence of a deletion endpoint is a hard compliance gap.

**Required action:** `@Contract` must define `DELETE /api/v1/users/me`, and `@Backend` must implement it. The cascade delete in the schema is correct — the code path to invoke it is missing.

### 4.2 Detection purge — MISSING

No endpoint exists for a user to delete their detection history without deleting their entire account (e.g. `DELETE /api/v1/detections`). This is a secondary gap — less urgent than account deletion but should be addressed in the same contract amendment.

---

## 5. Consent

### 5.1 Microphone consent

The browser's native `getUserMedia` permission prompt provides a minimal consent signal — the user must click "Allow" before audio capture begins. The `startAudio()` function in `src/frontend/src/ws/audio.ts` triggers this prompt via `navigator.mediaDevices.getUserMedia()`.

The onboarding screen (`src/frontend/src/views/onboarding.ts`, line 12) states: *"Your phone's microphone will begin listening immediately."* This is informational, not a consent gate — the user clicks "Get started" to proceed to the dashboard, and audio starts automatically when the display view opens.

**Gap:** The browser permission prompt does not explain what the audio is used for, how long it is retained, or whether it leaves the device. This information must be provided before the permission prompt is triggered — ideally in the onboarding screen with explicit wording about on-device processing.

**Required text (to be added to onboarding):** Something like: *"All audio processing happens on this device. No audio recordings are stored or transmitted to external servers. Bird detections (species name, confidence, time) are saved to your account."*

### 5.2 Account registration consent

The registration form (`src/frontend/src/views/register.ts`) collects email and password with no:
- Link to a privacy policy
- Consent checkbox
- Statement about what the email is used for

**Gap:** Users must be informed of data processing at the point of collection. A short statement (e.g. "Your email is used only for account authentication. See our [Privacy Policy].") and/or a checkbox is required.

---

## 6. Data Export

No mechanism exists for a user to export their data (detection history, account details). This is not universally required by law in all jurisdictions, but it is required under GDPR Article 20 (right to data portability) if the project is made available to users in the EU. Flagged as a non-blocking recommendation at this stage, but required before any EU-facing deployment.

---

## 7. Summary of Privacy Gaps

| Gap | Severity | Blocking? |
|---|---|---|
| No account deletion endpoint | Critical | **Yes** |
| No privacy policy / data processing notice | High | **Yes** |
| No retention policy documented | High | **Yes** |
| Onboarding does not explain audio processing scope | High | **Yes** |
| Registration form has no privacy statement or consent mechanism | Medium | **Yes** |
| No detection history purge endpoint | Medium | No (secondary to account deletion) |
| No data export mechanism | Low | No (depends on jurisdiction) |
