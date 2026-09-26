# syntax=docker/dockerfile:1.7
# Build context: repository root.
FROM python:3.12-slim-bookworm AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH

COPY --from=ghcr.io/astral-sh/uv:0.5.14 /uv /usr/local/bin/uv

# aiortc needs the ffmpeg/opus/vpx shared libraries at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libavdevice59 libavfilter8 libopus0 libvpx7 libsrtp2-1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first so a source-only change does not reinstall the world.
COPY services/api/pyproject.toml services/api/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-dev

COPY services/api/src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

RUN useradd --create-home --uid 10001 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD curl -fsS http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "agri_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
