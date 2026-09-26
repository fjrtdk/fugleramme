# Decisions Log

Append-only. Anything recorded here must never be asked again.

---

## 2026-09-26 — species table uses common_name as PRIMARY KEY

Accepted natural key for v1. BirdNET common names are unique per species. If regional variants with identical common names surface later, amend to surrogate UUID. Raised by @Contract, decided by Manager.

## 2026-09-26 — passlib replaced with direct bcrypt

passlib 1.7 crashes with bcrypt ≥ 4.x (wrap-bug detection in _finalize_backend_mixin). Replaced with direct `bcrypt` calls. Schema constraint "bcrypt or argon2id" is satisfied. Raised by @Backend, accepted by Manager.

## 2026-09-26 — Newest Arrival queue is strict FIFO

Queued novel arrivals do not interrupt the current countdown. A second novel arrival waits its turn. No queue jumping. Raised by @Spec, decided by Manager.

## 2026-09-26 — Newest Arrival falls back to Collage

When Newest Arrival display finishes and no prior mode was active, fall back to Collage (the default mode), not Latest Bird. Raised by @Spec, decided by Manager.

## 2026-09-26 — Security: account deletion deferred to v2

F-05 (no DELETE /users/me endpoint) is not a v1 blocker. This is a personal/hobby project, not a commercial EU deployment. GDPR Article 17 compliance deferred to v2. Raised by @Security, decided by Manager.

## 2026-09-26 — Security: JWT revocation via short TTL, not blocklist

Prefer short access token TTL (15min) + refresh token over a jti-based blocklist table. Simpler architecture. Deferred to security hardening pass. Raised by @Security, decided by Manager.

## 2026-09-26 — Security: .gitignore created for F-01 Critical

Created .gitignore excluding .jwt_secret, *.db, node_modules, __pycache__, assets/model/*.tflite. Resolves F-01 Critical finding. Done by Manager directly (scaffolding, not product code).

## 2026-09-26 — Fugleramme is personal, non-commercial, 3 users

Users: zasha, mom, girlfriend. No public distribution. No commercial use. BirdNET CC BY-NC-SA 4.0 clearly satisfied. No GDPR data controller obligations to third parties. Privacy policy and account deletion still implemented as good practice but are not legally required at this scale.
