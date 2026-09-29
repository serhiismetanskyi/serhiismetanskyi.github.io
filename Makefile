DOCKER_COMPOSE = docker compose
SERVICE = zensical
ZENSICAL = $(DOCKER_COMPOSE) run --rm $(SERVICE)

# Linters: versions come from uv.lock (djLint, Node); Biome is pinned here and fetched by npx
# (keep it in sync with the biome hook in .pre-commit-config.yaml).
# Their settings: biome.jsonc and [tool.djlint] in pyproject.toml
BIOME = uv run --locked npx --yes @biomejs/biome@2.5.14
DJLINT = uv run --locked djlint

# The container runs as you, so site/ and .cache/ are not owned by root
export UID := $(shell id -u)
export GID := $(shell id -g)

.DEFAULT_GOAL := help

.PHONY: help up down logs build test validate lint fix check install lock serve clean hooks pre-commit

## help: Show available commands
help:
	@echo "Available targets:"
	@echo "  make up       - start the Zensical dev server via Docker Compose (PORT=8000)"
	@echo "  make down     - stop and remove compose services"
	@echo "  make logs     - follow the Zensical container logs"
	@echo "  make build    - build the static site into site/ (Docker)"
	@echo "  make test     - strict build: fails on any warning (Docker)"
	@echo "  make validate - alias for test"
	@echo "  make lint     - Biome and djLint, check only"
	@echo "  make fix      - apply formatting and safe lint fixes, then lint"
	@echo "  make check    - lint + strict build with uv, without Docker (same as CI)"
	@echo "  make install  - uv sync: .venv with Zensical and the linters from uv.lock"
	@echo "  make lock     - update uv.lock after changing pyproject.toml"
	@echo "  make serve    - dev server with uv, without Docker"
	@echo "  make clean    - remove the built site, caches and temp files (keeps .venv)"
	@echo "  make hooks    - install the git pre-commit hooks"
	@echo "  make pre-commit - run all pre-commit hooks on every file"

## up: Start the Zensical dev server
up:
	$(DOCKER_COMPOSE) up $(SERVICE)

## down: Stop and remove compose services
down:
	$(DOCKER_COMPOSE) down

## logs: Follow the Zensical container logs
logs:
	$(DOCKER_COMPOSE) logs -f $(SERVICE)

## build: Build the static site
build:
	$(ZENSICAL) build --clean --config-file zensical.toml

## test: Strict build, warnings are errors
test:
	$(ZENSICAL) build --clean --strict --config-file zensical.toml

## validate: Alias for test
validate: test

## lint: Linters and format checks (Biome for JS and CSS, djLint for templates)
lint:
	$(BIOME) ci
	$(DJLINT) overrides --lint

## fix: Apply formatting and safe fixes, then lint
fix:
	$(BIOME) check --write
	$(MAKE) lint

## check: Linters + strict build with uv, as in CI
check: lint
	uv run --locked zensical build --strict --config-file zensical.toml

## install: .venv with Zensical and the linters, exactly as in uv.lock
install:
	uv sync --locked

## lock: Update uv.lock after changing pyproject.toml
lock:
	uv lock

## hooks: Install the git pre-commit hooks (.pre-commit-config.yaml)
hooks:
	uv run --locked pre-commit install

## pre-commit: Run every hook on all files, not only the staged ones
pre-commit:
	uv run --locked pre-commit run --all-files

## serve: Dev server without Docker
serve:
	uv run --locked zensical serve --config-file zensical.toml

## clean: Remove the built site, caches and temp files; .venv and the Docker uv volume stay
clean:
	rm -rf site .cache
	find . -path ./.venv -prune -o -path ./.git -prune -o \
		\( -name __pycache__ -o -name .DS_Store -o -name Thumbs.db -o -name '*.swp' -o -name '*~' \) -print -exec rm -rf {} +
