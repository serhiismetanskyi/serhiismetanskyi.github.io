---
date: 2026-09-25
tags:
  - python
  - libraries
  - uv
---

# uv — Scripts & Tools

## uv run

```bash
uv run python main.py          # run in project venv (auto-syncs deps)
uv run pytest                  # run installed CLI
uv run fastapi dev app/main.py # dev server
```

---

## Inline Script Dependencies (PEP 723)

```python
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx", "rich"]
# ///

import httpx
from rich import print

response = httpx.get("https://httpbin.org/json")
print(response.json())
```

```bash
uv run script.py                       # auto-installs deps
uv add --script script.py httpx rich   # add deps to script metadata
```

---

## uvx — One-Off Tool Runs

`uvx` = `uv tool run`. Runs in isolated temp env.

```bash
uvx ruff check .                     # lint
uvx black --check .                  # format check
uvx mypy src/                        # type check
uvx --from "ruff==0.11.0" ruff check # pin version
uvx --with ruff-lsp ruff check .     # with extra packages
```

---

## uv tool install — Persistent Tools

```bash
uv tool install ruff             # install to ~/.local/bin
uv tool install "ruff==0.11.0"  # pin version
uv tool list                     # show installed
uv tool upgrade --all            # upgrade all
uv tool uninstall ruff           # remove
```

---

## Shebang

```python
#!/usr/bin/env -S uv run
# /// script
# dependencies = ["rich"]
# ///

from rich import print
print("[bold green]Hello![/]")
```

```bash
chmod +x script.py && ./script.py
```

---

## uvx vs uv tool install

| | `uvx` | `uv tool install` |
|-|-------|-------------------|
| Lifetime | Ephemeral | Persistent |
| Updates | Latest by default; pin with `--from` | Manual upgrade |
| Best for | CI, one-off | Daily tools |
