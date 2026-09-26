# Licence Audit — Fugleramme

**Date:** 2026-09-26  
**Auditor:** @Compliance  
**Status:** BLOCK — see verdict.md

---

## 1. BirdNET Model and Labels

| Asset | Source | Licence | Compatibility | Assessment |
|---|---|---|---|---|
| `BirdNET_GLOBAL_6K_V2.4_Model_FP32.tflite` | `kahst/BirdNET-Analyzer` (GitHub raw, `checkpoints/V2.4/`) | **CC BY-NC-SA 4.0** | Non-commercial only, attribution required, share-alike | **BLOCK — see §1.1** |
| `BirdNET_GLOBAL_6K_V2.4_Labels.txt` | `kahst/BirdNET-Analyzer` (same repo) | **CC BY-NC-SA 4.0** | Same as above | **BLOCK — see §1.1** |

### 1.1 CC BY-NC-SA 4.0 — Non-commercial restriction

CC BY-NC-SA 4.0 prohibits use "primarily intended for or directed towards commercial advantage or monetary compensation."

**Current status of this project:** The binding describes the project as fully local, no cloud, no SaaS. The project name and code show no commercial features (no payment, no ads, no SaaS subscriptions). However, **the project contains no explicit statement that it is non-commercial**, and there is no licence file, README, or NOTICE that asserts this.

**Required action before merge:**
1. Add a top-level `NOTICE` or `README` section that explicitly states the project is non-commercial and that BirdNET is used under CC BY-NC-SA 4.0.
2. If the project is ever distributed publicly or commercially, a separate commercial licence from the BirdNET team (Kahl et al., Cornell Lab) must be obtained.

### 1.2 CC BY-NC-SA 4.0 — Attribution requirement

The licence requires: "You must give appropriate credit, provide a link to the licence, and indicate if changes were made."

**Gap:** No `NOTICE` file, no in-app attribution, no README attribution for BirdNET exists anywhere in the repository at audit time.

**Required action:** Add attribution. See `attribution.md` for the required text.

### 1.3 CC BY-NC-SA 4.0 — Share-alike

The SA clause requires that any adapted material be distributed under the same licence. The project uses the BirdNET model for inference but does not redistribute modified model weights. The share-alike clause is not triggered for the application code itself (only for modified versions of the model/labels). No violation found here, but this must be re-evaluated if model weights are fine-tuned or re-exported.

---

## 2. Python Runtime Dependencies

Source: `/Users/fjrt/workspace/Fugleramme/pyproject.toml`

| Package | Version constraint | Licence | Compatible with CC BY-NC-SA 4.0 project | Notes |
|---|---|---|---|---|
| `fastapi` | ≥0.115 | MIT | Yes | No restrictions |
| `uvicorn[standard]` | ≥0.32 | BSD-3-Clause | Yes | No restrictions |
| `python-jose[cryptography]` | ≥3.3 | MIT | Yes | `cryptography` dep is Apache 2.0; compatible |
| `bcrypt` | ≥4.0 | Apache 2.0 | Yes | No restrictions |
| `aiosqlite` | ≥0.20 | MIT | Yes | No restrictions |
| `email-validator` | ≥2.0 | MIT | Yes | No restrictions |
| `numpy` | ≥1.26 | BSD-3-Clause | Yes | No restrictions |
| `ai-edge-litert` | ≥1.0 | Apache 2.0 | Yes | Google's TFLite runtime rename; no restrictions on use |
| `hatchling` (build-system) | — | MIT | Yes | Build-time only; not shipped |

**Build-time / test-only (not shipped in distribution):**

| Package | Licence | Notes |
|---|---|---|
| `pytest` | MIT | Test-only |
| `pytest-asyncio` | Apache 2.0 | Test-only |
| `httpx` | BSD-3-Clause | Test-only |

No Python dependency conflicts or non-commercial restrictions found. All Python deps are permissively licensed (MIT, BSD, Apache 2.0).

---

## 3. JavaScript / Frontend Dependencies

Source: `/Users/fjrt/workspace/Fugleramme/src/frontend/package.json`

All JS dependencies are `devDependencies` — they are build-time tools. Their code is not bundled into the shipped application.

| Package | Version constraint | Licence | Notes |
|---|---|---|---|
| `vite` | ^5.2.0 | MIT | Build tool; dev-only |
| `typescript` | ^5.4.0 | Apache 2.0 | Compiler; dev-only |

**Notable transitive build-time deps (present in `node_modules`, not shipped):**

| Package | Licence | Notes |
|---|---|---|
| `esbuild` | MIT | Vite bundler engine |
| `rollup` | MIT | Vite bundler |
| `postcss` | MIT | CSS processing |
| `picocolors` | ISC | Terminal colours for CLI |
| `nanoid` | MIT | ID generation (build tooling) |
| `source-map-js` | BSD-3-Clause | Source maps |

No JS dependency conflicts found. All are permissively licensed.

---

## 4. AVONET Body-Mass Data

The `species` table in `contracts/schema.md` contains a `body_mass_g` column documented as "Mean adult body mass in grams." The task notes this may come from the AVONET dataset (CC BY 4.0).

**Finding:** No AVONET import script, seed file, or reference to AVONET exists in the repository at audit time. The column is defined but no data source is identified in code or contracts.

**Required action:** Before any AVONET data is ingested:
1. Confirm the source dataset and its exact licence.
2. If AVONET (CC BY 4.0), add attribution in `NOTICE` (see `attribution.md` §3).
3. If another source, verify licence compatibility before use.

---

## 5. Bird Illustrations

The `assets/artwork/` directory does not exist at audit time. The PWA icons (`src/frontend/public/icons/icon-192.svg`, `icon-512.svg`) are placeholder SVGs.

The original Fugleramme concept uses Biodiversity Heritage Library (BHL) scanned artwork, redistributed via Arne Giacomo's collection under **CC BY-SA 4.0**.

**Current status:** No illustration assets are present. No violation.

**Required action before artwork is added:**
1. Each illustration file must be accompanied by source attribution (publication, BHL item URL, digitiser credit).
2. The CC BY-SA 4.0 share-alike clause requires that any derived images be distributed under the same licence.
3. Attribution must appear in `NOTICE` (see `attribution.md` §2).
4. `@Content` must record provenance in a per-asset manifest before any artwork ships.

---

## 6. Summary of Licence Findings

| Finding | Severity | Blocking? |
|---|---|---|
| No NOTICE file — BirdNET attribution missing | High | Yes |
| No explicit non-commercial statement for BirdNET model use | High | Yes |
| AVONET data source unidentified | Medium | No (no data present yet) |
| Illustration provenance not yet established | Low | No (no artwork present yet) |
| All Python/JS runtime deps permissively licensed | — | No |
