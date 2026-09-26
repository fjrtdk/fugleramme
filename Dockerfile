# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /frontend

COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci

COPY src/frontend/ ./
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim-bookworm AS runtime

# libgomp1 is required by numpy and the TFLite runtime (OpenMP)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies from pyproject.toml
# Copying only the project descriptor first improves layer caching;
# source code is copied below after the (slower) dep-install step.
COPY pyproject.toml ./
COPY src/ ./src/

RUN pip install --no-cache-dir .

# Download BirdNET model and labels into assets/model/ at build time
# so the container starts instantly and does not need outbound internet access at runtime.
RUN python -m src.backend.birdnet.download_model

# Copy compiled frontend assets from the first stage
COPY --from=frontend-build /frontend/dist/ ./frontend_dist/

# ── Runtime configuration ────────────────────────────────────────────────────
# PORT is injected by Verdent at runtime; default to 8080 so the image works
# in plain `docker run` without extra flags.
ENV FRONTEND_DIR=/app/frontend_dist
ENV ENVIRONMENT=production

EXPOSE 8080

# Shell form so ${PORT:-8080} is expanded by the shell at start time.
CMD uvicorn src.backend.main:app --host 0.0.0.0 --port ${PORT:-8080}
