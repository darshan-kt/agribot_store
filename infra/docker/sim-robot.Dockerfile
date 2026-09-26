# syntax=docker/dockerfile:1.7
# Build context: repository root.
FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH

COPY --from=ghcr.io/astral-sh/uv:0.5.14 /uv /usr/local/bin/uv

WORKDIR /app

COPY services/sim-robot/pyproject.toml services/sim-robot/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-dev

COPY services/sim-robot/src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

RUN useradd --create-home --uid 10002 simuser && chown -R simuser /app
USER simuser

CMD ["python", "-m", "agri_sim.main"]
