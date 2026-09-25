---
date: 2026-09-25
tags:
  - python
  - libraries
  - uv
---

# uv — Build & Publish

## Build Backend

```toml
[build-system]
requires = ["uv_build>=0.11,<0.12"]
build-backend = "uv_build"
```

| Backend | Best for |
|---------|----------|
| `uv_build` | Pure Python (fastest) |
| `hatchling` | Pure Python + hooks |
| `setuptools` | C extensions |
| `maturin` | Rust extensions |

---

## Build

```bash
uv build                    # → dist/ (sdist + wheel)
uv build --wheel            # wheel only
uv build --sdist            # sdist only
```

---

## Version

```bash
uv version                  # show
uv version 1.2.3           # set
uv version --bump major    # 0.1.0 → 1.0.0
uv version --bump minor    # 0.1.0 → 0.2.0
uv version --bump patch    # 0.1.0 → 0.1.1
```

---

## Publish

```bash
uv publish                       # → PyPI
uv publish --publish-url https://test.pypi.org/legacy/ --check-url https://test.pypi.org/simple  # → TestPyPI
uv publish --token $PYPI_TOKEN   # explicit token
```

Auth via env vars:

```bash
export UV_PUBLISH_TOKEN="pypi-..."
```

---

## CI Publish (Trusted Publishing)

```yaml
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv build
      - run: uv publish --trusted-publishing always
```

No API tokens needed — uses OIDC.

---

## Audit

```bash
uv audit                    # check vulnerabilities
uv lock --upgrade-package <package>  # upgrade vulnerable package explicitly
```

---

## Release Checklist

```bash
uv version --bump minor
uv lock
uv build
uv publish --index testpypi
uv publish
git tag v$(uv version --short) && git push --tags
```
