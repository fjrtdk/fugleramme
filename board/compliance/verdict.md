# Compliance Verdict — Fugleramme

**Date:** 2026-09-26  
**Auditor:** @Compliance  
**Verdict:** **BLOCK**

---

## Verdict

**BLOCK. This merge may not proceed until the following items are resolved.**

Six blocking issues are documented across licence compliance and data privacy. They are listed in priority order. None can be deferred.

---

## Blocking Issues

### BLOCK-1 — BirdNET CC BY-NC-SA 4.0: No attribution exists

**Category:** Licence compliance  
**Evidence:** `src/backend/birdnet/download_model.py` downloads the model from `kahst/BirdNET-Analyzer` (CC BY-NC-SA 4.0). No `NOTICE` file, no README, no in-app attribution exists anywhere in the repository.

**Required fix:**
- Create a top-level `NOTICE` file with the BirdNET attribution text specified in `board/compliance/attribution.md §1`.
- Owner: `@Docs` creates the `NOTICE` file. `@Compliance` re-audits.

---

### BLOCK-2 — BirdNET CC BY-NC-SA 4.0: No explicit non-commercial declaration

**Category:** Licence compliance  
**Evidence:** The binding describes the project as local and personal, but the codebase contains no assertion that the project is non-commercial. CC BY-NC-SA 4.0 prohibits commercial use. If this project is ever distributed or monetised without resolving this, it violates the BirdNET licence.

**Required fix:**
- Add a clear statement in `NOTICE` and in the project README that Fugleramme is a non-commercial personal project and that the BirdNET assets are used under the NC restriction.
- If any commercial use is intended (distribution, SaaS, sponsorship), a separate commercial licence must be obtained from the BirdNET authors before that use begins.
- Owner: project maintainer confirms intent; `@Docs` adds the statement.

---

### BLOCK-3 — No account deletion endpoint

**Category:** Data privacy — right to erasure  
**Evidence:** `contracts/api.md` defines no `DELETE /api/v1/users/me` endpoint. `contracts/schema.md` confirms `ON DELETE CASCADE` is set for `detections` and `user_settings`, so the database is prepared, but no API surface exposes deletion to users.

**Required fix:**
- `@Contract` must add `DELETE /api/v1/users/me` to `contracts/api.md`.
- `@Backend` must implement the endpoint, triggering the cascade delete in SQLite.
- Owner: `@Contract` first (contract gate), then `@Backend`.

---

### BLOCK-4 — No privacy policy / data processing notice

**Category:** Data privacy — transparency  
**Evidence:** No privacy policy page, no `PRIVACY.md`, no data processing notice exists. Users are not informed of what data is collected, for how long, under what legal basis, or how to request deletion.

**Required fix:**
- A privacy notice must exist and must be reachable from the registration page and the onboarding screen. At minimum it must cover: data collected (email, detection history), purpose, retention, deletion mechanism, and contact for data requests.
- Owner: `@Spec` to write the user story; `@Web` to surface the page; `@Docs` to author the content.

---

### BLOCK-5 — No data retention policy

**Category:** Data privacy — data minimisation  
**Evidence:** `contracts/schema.md` and `contracts/api.md` define no TTL, max-row limit, or purge mechanism for the `detections` table. Detections accumulate indefinitely.

**Required fix:**
- Define a retention policy (e.g. rolling 90-day window, or manual purge on user request, or a documented "retain all" choice with user-visible control).
- Document the policy in `contracts/schema.md` and in the privacy notice.
- Owner: `@Spec` to define the story; `@Contract` to document the policy; `@Data` to implement a migration if a TTL is chosen; `@Backend` if a purge endpoint is required.

---

### BLOCK-6 — Registration form and onboarding have no consent mechanism

**Category:** Data privacy — informed consent  
**Evidence:**
- `src/frontend/src/views/register.ts`: email + password form with no privacy statement, no link to a privacy policy, no consent checkbox.
- `src/frontend/src/views/onboarding.ts`: informs the user that the microphone "will begin listening immediately" but does not explain that processing is on-device, that no audio is stored, or that detection metadata is saved to their account.

**Required fix:**
- Registration form must include at minimum a statement linking to the privacy policy and clarifying what the email is used for.
- Onboarding screen must be amended to explicitly state: (a) all audio processing is on-device, (b) no audio recordings are stored or transmitted externally, (c) detection metadata (species, confidence, timestamp) is stored in the user's account.
- Owner: `@Web` to amend the forms; `@Spec` to write the acceptance criteria.

---

## Non-Blocking Recommendations

These do not block this merge but must be addressed before any future EU-facing deployment or before artwork assets are committed.

| Item | Priority | Owner |
|---|---|---|
| Add detection history purge endpoint (`DELETE /api/v1/detections`) | Should-have | `@Contract` + `@Backend` |
| Add data export endpoint (GDPR Art. 20 portability) | Nice-to-have for EU | `@Contract` + `@Backend` |
| Establish AVONET data provenance before `body_mass_g` is populated | Required before data import | `@Content` + `@Compliance` re-audit |
| Create `assets/artwork/PROVENANCE.json` before any illustration is committed | Required before artwork ships | `@Content` + `@Compliance` re-audit |

---

## Acceptance Conditions

This verdict changes from **BLOCK** to **PASS** when all six blocking items above have been fixed, implemented, and re-reviewed by `@Compliance`. Each fix requires a new `@Compliance` audit pass; partial fixes do not lift the block.

| Blocking item | Fix status |
|---|---|
| BLOCK-1: BirdNET attribution | Open |
| BLOCK-2: Non-commercial declaration | Open |
| BLOCK-3: Account deletion endpoint | Open |
| BLOCK-4: Privacy policy | Open |
| BLOCK-5: Data retention policy | Open |
| BLOCK-6: Consent on registration / onboarding | Open |
