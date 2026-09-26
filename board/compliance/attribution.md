# Attribution — Fugleramme

**Date:** 2026-09-26  
**Auditor:** @Compliance  
**Status:** REQUIRED — no attribution exists in the repository at audit time.

---

## Required attribution is currently missing

No `NOTICE`, `LICENSE`, `CREDITS`, or README attribution exists anywhere in the repository. The files below must be created before this project is distributed or used in any context beyond the author's own machine.

---

## 1. BirdNET Model and Labels (CC BY-NC-SA 4.0) — REQUIRED NOW

The BirdNET TFLite model (`BirdNET_GLOBAL_6K_V2.4_Model_FP32.tflite`) and species label file (`BirdNET_GLOBAL_6K_V2.4_Labels.txt`) are licensed under **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**.

The licence requires:
- Attribution of the authors
- A link to the licence
- Indication that the material is used (not modified) and that the project is non-commercial

**Minimum required NOTICE entry:**

```
BirdNET Model and Labels
========================
Files: assets/model/BirdNET_GLOBAL_6K_V2.4_Model_FP32.tflite
       assets/model/BirdNET_GLOBAL_6K_V2.4_Labels.txt

Source: BirdNET-Analyzer, https://github.com/kahst/BirdNET-Analyzer
Authors: Stefan Kahl, Connor Wood, Maximilian Eibl, Holger Klinck
Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
         https://creativecommons.org/licenses/by-nc-sa/4.0/

These files are used unmodified for local, non-commercial bird species
identification. Fugleramme is a non-commercial personal project.
No model weights have been altered. Any redistribution of these files
must be under the same CC BY-NC-SA 4.0 licence.

Recommended citation:
  Kahl, S., Wood, C. M., Eibl, M., & Klinck, H. (2021).
  BirdNET: A deep learning solution for avian diversity monitoring.
  Ecological Informatics, 61, 101236.
  https://doi.org/10.1016/j.ecoinf.2021.101236
```

---

## 2. Bird Illustrations (CC BY-SA 4.0) — REQUIRED WHEN ARTWORK IS ADDED

When illustrations from the Biodiversity Heritage Library (BHL) are added to `assets/artwork/`, each illustration must be attributed individually and a blanket attribution must appear in `NOTICE`.

**Blanket NOTICE entry (add when first illustration is committed):**

```
Bird Illustrations
==================
Directory: assets/artwork/

Sources: Biodiversity Heritage Library (BHL), https://www.biodiversitylibrary.org
         Original digital collection by Arne Giacomo
Licence: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
         https://creativecommons.org/licenses/by-sa/4.0/

Each illustration file is accompanied by a provenance record in
assets/artwork/PROVENANCE.json specifying the BHL item URL, publication
title, illustrator (if known), publication year, and digitiser credit.

Any modification or redistribution of these illustrations must be under
the same CC BY-SA 4.0 licence. Attribution must be preserved.
```

**Per-file requirement:** `@Content` must maintain `assets/artwork/PROVENANCE.json` with at minimum:
```json
{
  "turdus_merula.png": {
    "bhl_item_url": "https://www.biodiversitylibrary.org/item/...",
    "publication": "...",
    "illustrator": "...",
    "year": 1900,
    "digitiser": "Arne Giacomo / BHL"
  }
}
```

---

## 3. AVONET Body-Mass Data (CC BY 4.0) — REQUIRED IF USED

If the `species.body_mass_g` column is populated from the AVONET dataset:

```
AVONET Body-Mass Data
=====================
Table column: species.body_mass_g

Source: AVONET: morphological, ecological and geographical data for
        all birds, Tobias et al. (2022), Ecology Letters
        https://doi.org/10.1111/ele.13898
        Dataset: https://doi.org/10.6084/m9.figshare.16586228
Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
         https://creativecommons.org/licenses/by/4.0/

Data used: mean adult body mass (g) for species in the BirdNET label set.
No modifications made to source values.
```

---

## 4. Where to place this attribution

A top-level `NOTICE` file must be created at the repository root containing all applicable sections above. This is the standard location required by Apache 2.0 and expected by CC BY / CC BY-SA / CC BY-NC-SA licences.

`@Docs` should also include a brief attribution section in any public-facing README once the project is published.

---

## 5. What does NOT require attribution at this time

| Item | Reason |
|---|---|
| Python runtime deps (MIT, BSD, Apache) | Attribution not required in end-product for personal/non-distributed use; standard practice is to include their licences if shipping a distribution |
| Vite, TypeScript (build-time only, MIT/Apache) | Not shipped to end users; no attribution required at runtime |
| PWA placeholder icons | No third-party source; compliance-free |
