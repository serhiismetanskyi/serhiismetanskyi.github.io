---
date: 2026-07-31
tags:
  - robot-framework
  - test-automation
---

# Parallel Execution with Pabot

[Pabot](https://pabot.org/) is a parallel test runner for Robot Framework. It spawns multiple `robot` processes and merges logs/reports. Default scheduling is **per suite file**; optional **test-level** splitting assigns individual test cases to workers for finer granularity (and more overhead).

## Installation

```bash
uv add --dev robotframework-pabot
```

Use the same Python environment as Robot Framework and your libraries. In CI, pin `robotframework-pabot` (and `robotframework`) versions for reproducible shards.

## Execution levels

| Mode | How it works | Typical use |
|------|----------------|-------------|
| **Suite level** (default) | Each worker runs one or more **suite files** end-to-end. | Large suites per feature; lowest coordination cost. |
| **Test level** | `--testlevelsplit` distributes **test cases** across workers. | Many short tests in few files; need higher CPU utilization. |

Suite-level parallelism is usually the first step: fewer moving parts and clearer log boundaries. Add `--testlevelsplit` when profiling shows idle workers and small tests dominate runtime.

## Key CLI options

| Option | Description |
|--------|-------------|
| `--processes N` | Cap or set worker count (often aligned with CI vCPU). |
| `--testlevelsplit` | Split work at **test case** granularity instead of default suite split. |
| `--pabotlib` | Start/use **PabotLib** for cross-process coordination (locks, shared values). |
| `--resourcefile path` | Optional **shared variable file** all workers read (read-only shared config). |
| `--ordering file` | Control execution order via Pabot ordering file (stability, dependency hints). |

See `pabot --help` for host/port flags (`--pabotlibhost`, `--pabotlibport`) when the library server is remote.

## Requirements for reliable parallel tests

| Requirement | Why it matters |
|-------------|----------------|
| No shared **mutable** state | Two processes writing the same file or global breaks isolation. |
| **Isolated** test data | Use unique IDs per test (UUID, timestamp) or dedicated schemas. |
| **Thread-safe** helpers | Python utilities used from keywords must be safe if libraries share state internally. |
| **Independent** DB transactions | Roll back or use disposable databases; avoid long-lived locks across workers. |

If two tests must share a scarce resource (one license server, one mobile device), use **explicit serialization** via PabotLib instead of implicit “hope they don’t collide.”

## Pabot 4.0.0+ (2025-era behavior)

Recent Pabot releases improve **sharding** (smarter work distribution) and make **PabotLib integration** the default path for coordination in many setups—verify your installed version with `pabot --version` and read the release notes when upgrading CI images.

## Shared resources with PabotLib

Import the library and use keywords such as:

- **Acquire Lock** / **Release Lock** — serialize access to a named resource.
- **Get Parallel Value** / **Set Parallel Value** — share small pieces of data across workers when file-based config is not enough.

Keep shared state minimal; prefer **environment + read-only resource files** for static configuration.

## Tag-based selective execution

```bash
pabot --processes 4 --include smoke --exclude slow tests/
```

Combine with suite structure so `smoke` stays fast and parallel-friendly. Use `slow` or `integration` tags to isolate heavy jobs into a separate pipeline stage if needed.

## Test splitting strategies for CI/CD

| Strategy | Idea |
|----------|------|
| **Shard by suite** | One job per directory or glob; simplest, good cache locality. |
| **Dynamic `--processes`** | Set from `nproc` or CI “parallelism” knob. |
| **Stage fast vs slow** | Run `pabot --include smoke` on every commit; full parallel regression nightly. |
| **Artifact merge** | Use Pabot’s merged output or a single `--outputdir` pattern your reporter understands. |

## Example: `pabot` with options

```bash
pabot \
  --processes 6 \
  --testlevelsplit \
  --pabotlib \
  --resourcefile config/parallel_shared.yaml \
  --ordering pabot_order.txt \
  --outputdir results/pabot \
  tests/
```

Adjust `--processes` to your runner; drop `--testlevelsplit` if suite-level parallelism already saturates CPUs without extra process churn.
