---
date: 2026-07-27
tags:
  - robot-framework
  - test-automation
---

# Layered Architecture

Enterprise Robot Framework automation stays maintainable when **tests stay thin**, **keywords express behavior**, and **technical detail lives in libraries and infrastructure**. A five-layer model maps cleanly to folders, imports, and code review boundaries.

## Five layers (top to bottom)

| Layer | Typical artifacts | Responsibility |
| ----- | ----------------- | -------------- |
| **Test** | `.robot` suites under `tests/` | **What** to verify: scenarios, data sets, tags, acceptance criteria. No low-level wiring. |
| **Keyword** | `.resource` (or shared `.robot`) under `resources/` | **How** users and testers describe steps: composed, readable keywords (often page/feature oriented). |
| **Service** | Python helpers + RF libraries wrapping APIs, DB, messaging | **How the system works** at integration boundaries: clients, DTO mapping, retries, domain rules too heavy for RF syntax. |
| **Core** | Shared utilities, constants, small pure functions | Cross-cutting logic used by services (parsing, crypto helpers, validators) without I/O when possible. |
| **Infrastructure** | Drivers, config loaders, secrets, CI hooks, containers | **Communication** with the world: HTTP/Selenium/Appium adapters, env-specific endpoints, logging setup. |

Lower layers must not import or call test suites upward. **Dependency direction**: `tests` → `resources` → `libraries` (+ `core`) → `infra` adapters.

## Separation of concerns (quick reference)

| Concern | Owns it | Should not own it |
| ------- | ------- | ----------------- |
| Scenario intent | Test layer | Selector strings, raw HTTP paths, SQL |
| Readable workflow | Keyword layer | One-off test assertions mixed with UI locators in every suite |
| System integration | Service / library layer | Business “story” duplication across suites |
| Env & tooling | Infrastructure | Application business rules |

## Example directory layout

```
project/
├── tests/           # .robot test files
├── resources/       # .resource keyword files
├── libraries/       # Custom Python libraries
├── data/            # Test data (YAML, CSV, JSON)
├── config/          # Environment configs
└── results/         # Output (gitignored)
```

Keep **generated output** (`log.html`, `report.html`, `output.xml`) out of version control; point `robot` output to `results/` in CI and locally.

## Resource file vs Python library

| Use **`.resource` / keywords** | Use **Python library** |
| ----------------------------- | ---------------------- |
| Composing existing keywords, Gherkin-style flows, readable abstractions | Non-trivial algorithms, heavy data transforms, shared code with unit tests |
| Team members who prefer RF syntax | Strong typing, IDE refactoring, performance-critical loops |
| Thin wrappers around one library keyword | Direct use of third-party SDKs (HTTP client, DB driver) |

**Rule of thumb**: if it is mostly “call A, then B, assert C” using existing building blocks, keep it in a resource. If you need classes, exceptions, or many branches, use Python and expose a small keyword surface.

## Dependency management

Avoid a bare, unpinned `requirements.txt` for automation code that ships with your product.

| Approach | Why |
| -------- | --- |
| **`uv` + `uv.lock`** | Fast installs, reproducible CI, simple `uv sync` in pipelines |
| **Poetry** (`poetry.lock`) | Mature lockfile workflow, good for larger Python ecosystems |

Pin **Robot Framework**, **libraries** (e.g. `robotframework-seleniumlibrary`), and **linters** (e.g. `robotframework-robocop`) in the same manifest so local and CI runs match.

### Minimal `pyproject.toml` sketch (uv)

```toml
[project]
name = "acme-rf-tests"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "robotframework>=7.0",
]

[tool.uv]
dev-dependencies = [
  "robotframework-robocop>=5.0",
]
```

Run: `uv lock` then `uv sync`. Invoke Robot with `uv run robot --outputdir results tests/`.

## Practical checklist

- [ ] Tests import only keywords/resources, not raw infra modules.
- [ ] No circular imports between resources; split shared keywords by domain.
- [ ] Libraries expose **few, stable** keywords; hide implementation details.
- [ ] Config and secrets loaded once per layer (infra), passed down—not hardcoded in tests.
