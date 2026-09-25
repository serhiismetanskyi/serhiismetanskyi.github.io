---
date: 2026-09-25
tags:
  - python
  - libraries
  - uv
---

# uv — Python & Environments

## Python Versions

```bash
uv python install 3.13          # download + install
uv python install 3.12 3.13    # multiple versions
uv python list --only-installed # show installed
uv python uninstall 3.12       # remove
```

---

## Version Pinning

```bash
uv python pin 3.13              # → .python-version (project)
uv python pin 3.13 --global     # → ~/.python-version (global)
```

```toml
# pyproject.toml — package-level constraint
[project]
requires-python = ">=3.12"
```

| Mechanism | Scope |
|-----------|-------|
| `.python-version` | Which Python uv uses locally |
| `requires-python` | Minimum for package consumers |

---

## Virtual Environments

```bash
uv venv                        # create .venv (auto-selects Python)
uv venv --python 3.13          # specific version
source .venv/bin/activate       # optional — uv run does this for you
```

`uv run` and `uv sync` manage `.venv` automatically.

---

## uv pip (Legacy Compat)

```bash
uv pip install httpx
uv pip install -r requirements.txt
uv pip compile pyproject.toml -o requirements.txt
uv pip list
uv pip freeze
```

Does not modify `pyproject.toml` or `uv.lock`.

---

## Python Discovery Order

1. `--python` flag
2. `UV_PYTHON` env var
3. `.python-version`
4. `requires-python` in `pyproject.toml`
5. System Python

---

## Multi-Version Testing

```bash
uv run --python 3.12 pytest
uv run --python 3.13 pytest
```
