---
date: 2026-09-25
tags:
  - python
  - libraries
  - uv
---

# uv — Workspaces & Docker

## Workspaces (Monorepo)

```toml
# root pyproject.toml
[tool.uv.workspace]
members = ["packages/*", "services/*"]
```

```bash
uv lock                             # resolve entire workspace
uv run --package api fastapi dev    # run in specific member
uv add --package api httpx          # add dep to member
```

Inter-package deps:

```toml
# services/api/pyproject.toml
[project]
dependencies = ["shared-lib"]

[tool.uv.sources]
shared-lib = { workspace = true }
```

---

## Docker

```dockerfile
FROM python:3.13-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.11.3 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .
RUN uv sync --frozen --no-dev

FROM python:3.13-slim
WORKDIR /app
COPY --from=builder /app /app
ENV PATH="/app/.venv/bin:$PATH"
CMD ["fastapi", "run", "app/main.py", "--host", "0.0.0.0"]
```

Key tricks: pin uv version in image, copy lockfile first (cache deps layer), `--frozen` (no resolution), `UV_COMPILE_BYTECODE=1` (faster startup).

---

## CI (GitHub Actions)

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: astral-sh/setup-uv@v5
    with:
      enable-cache: true
  - run: uv lock --check
  - run: uv sync --locked
  - run: uv run pytest --cov
```

`--locked` is stricter for CI consistency; `--frozen` skips lockfile freshness checks.

---

## Docker (Production, Non-Editable)

```dockerfile
FROM python:3.13-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.11.3 /uv /usr/local/bin/uv
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-editable

COPY . .
RUN uv sync --locked --no-editable

FROM python:3.13-slim
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
CMD ["fastapi", "run", "app/main.py", "--host", "0.0.0.0"]
```

This pattern removes runtime dependency on source tree and keeps the final image smaller.

---

## Cache

```bash
uv cache clean              # clear all
uv cache clean httpx        # clear one package
```

`--refresh` re-validates, `--reinstall` forces re-install.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `UV_PYTHON` | Default Python version |
| `UV_CACHE_DIR` | Cache directory |
| `UV_COMPILE_BYTECODE` | Compile `.pyc` on install |
| `UV_LINK_MODE` | `copy` / `symlink` |
| `UV_DEFAULT_INDEX` | Default package index URL |
| `UV_INDEX` | Additional package index URL(s) |
| `UV_EXCLUDE_NEWER` | Ignore packages after date |
