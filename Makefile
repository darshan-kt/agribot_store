# Agri Robot App Store — developer entry points.
# `make dev` is the one command that brings the whole stack up.

SHELL := /bin/bash
COMPOSE := docker compose -f infra/docker-compose.yml --env-file .env

# ROS 2 Humble is sourced from ~/.bashrc on some dev machines and injects its
# Python 3.10 site-packages into PYTHONPATH, which breaks the project venvs.
# Every Python invocation below runs with a clean PYTHONPATH.
PY := env -u PYTHONPATH
UV := $(PY) uv

# Database URL for host-side tools (Alembic, the seed script). Inside the compose
# network services use the `postgres` hostname; from the host it is a published port.
DB_ENV := $(PY) sh -c 'set -a; . ./.env; set +a; \
  export AGRI_DATABASE_URL="postgresql+asyncpg://$$POSTGRES_USER:$$POSTGRES_PASSWORD@localhost:$$POSTGRES_PORT/$$POSTGRES_DB"; \
  export AGRI_JWT_SECRET="$$JWT_SECRET"; cd services/api && exec "$$0" "$$@"'

.DEFAULT_GOAL := help
.PHONY: help env certs broker-auth bootstrap dev up down logs ps restart clean \
        s3-auth install lint format format-check typecheck test test-web test-api test-sim \
        migrate migrate-down migration seed reseed db-shell gen fixtures \
        build health

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------- bootstrap --

env: ## Create .env from .env.example with generated secrets
	@./infra/scripts/gen-env.sh

certs: ## Generate the local development CA and broker certificate
	@./infra/scripts/gen-certs.sh

broker-auth: env ## Build the Mosquitto password file from .env
	@./infra/scripts/gen-broker-auth.sh

s3-auth: env ## Render the SeaweedFS S3 identity file from .env
	@./infra/scripts/gen-s3-auth.sh

install: ## Install all JS and Python dependencies
	pnpm install
	cd services/api && $(UV) sync
	cd services/sim-robot && $(UV) sync

bootstrap: env certs broker-auth s3-auth install ## One-time setup for a fresh clone

# --------------------------------------------------------------------- run --

dev: bootstrap ## Start the whole stack, migrate and seed, then report health
	$(COMPOSE) up --build -d
	@$(MAKE) --no-print-directory migrate
	@$(MAKE) --no-print-directory seed
	@$(MAKE) --no-print-directory health

up: ## Start the stack without rebuilding
	$(COMPOSE) up -d

down: ## Stop the stack (volumes are kept)
	$(COMPOSE) down

clean: ## Stop the stack and delete its volumes (DESTROYS local data)
	$(COMPOSE) down -v

ps: ## Show container status
	$(COMPOSE) ps

logs: ## Tail logs from every service
	$(COMPOSE) logs -f --tail=100

restart: ## Restart one service, e.g. make restart S=api
	$(COMPOSE) restart $(S)

health: ## Report the health of each service
	@echo "--- containers ---"
	@$(COMPOSE) ps --format 'table {{.Service}}\t{{.Status}}'
	@echo "--- endpoints ---"
	@printf 'api  /healthz : '; curl -fsS http://localhost:$${API_PORT:-8000}/healthz || echo 'DOWN'
	@echo
	@printf 'web  /        : '; curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:$${WEB_PORT:-3000}/ || echo 'DOWN'

# -------------------------------------------------------------------- data --

migrate: ## Apply all database migrations
	$(DB_ENV) uv run alembic upgrade head

migrate-down: ## Roll back the most recent migration
	$(DB_ENV) uv run alembic downgrade -1

migration: ## Autogenerate a migration, e.g. make migration M="add spray log"
	$(DB_ENV) uv run alembic revision --autogenerate -m "$(M)"

seed: ## Seed reference data and a week of history (no-op if already seeded)
	$(DB_ENV) uv run python -m agri_api.db.seed

reseed: ## Wipe seeded data and rebuild it (DESTRUCTIVE)
	$(DB_ENV) uv run python -m agri_api.db.seed --reset

db-shell: ## Open psql against the running database
	$(COMPOSE) exec postgres sh -c 'psql -U $$POSTGRES_USER -d $$POSTGRES_DB'

gen: ## Regenerate types from the JSON Schemas and OpenAPI spec
	pnpm --filter @agri/contracts run gen

fixtures: ## Export the seeded database as JSON fixtures for the UI
	$(DB_ENV) uv run python -m agri_api.db.export_fixtures

# ------------------------------------------------------------------ verify --

lint: ## Lint everything
	pnpm run lint
	cd services/api && $(UV) run ruff check .
	cd services/sim-robot && $(UV) run ruff check .

format: ## Format everything
	pnpm run format
	cd services/api && $(UV) run ruff format .
	cd services/sim-robot && $(UV) run ruff format .

format-check: ## Check formatting without writing
	pnpm run format:check
	cd services/api && $(UV) run ruff format --check .
	cd services/sim-robot && $(UV) run ruff format --check .

typecheck: ## Type-check everything
	pnpm run typecheck
	cd services/api && $(UV) run mypy src
	cd services/sim-robot && $(UV) run mypy src

test: test-web test-api test-sim ## Run every test suite

test-web:
	pnpm run test

test-api:
	cd services/api && $(UV) run pytest

test-sim:
	cd services/sim-robot && $(UV) run pytest

build: ## Production build of the web app
	pnpm run build
