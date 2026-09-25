---
date: 2026-06-27
tags:
  - ai-agents
  - coding-agents
---

# AGENTS.md Playground

Hands-on exercises for writing effective `AGENTS.md` files. Each exercise targets a specific section — combine them in Exercise 6.

---

## Exercise 1 — Mission Statement

Write a mission block (2–4 sentences). Pick a project:

| Option | Stack |
|---|---|
| **A** — E-commerce API | Python, FastAPI, PostgreSQL, Redis |
| **B** — Mobile backend | Go, gRPC, MongoDB |
| **C** — Design system | TypeScript, React, Storybook |

??? example "Reference Solution (Option A)"

    ```markdown
    > **Project:** ShopAPI — RESTful e-commerce backend.
    > **Stack:** Python 3.12, FastAPI, PostgreSQL 16, Redis 7.
    > **Core constraint:** All endpoints must be idempotent;
    > double-submit must never create duplicate orders.
    ```

**Self-Check:** understandable in 10 seconds | core constraint is a hard rule | no implementation details

---

## Exercise 2 — Toolchain Registry

Create a toolchain table. Every row answers: "What command do I run?"

??? example "Reference Solution"

    | Action | Command | Authority |
    |---|---|---|
    | Build | `uv run python -m build` | `pyproject.toml` |
    | Test | `uv run pytest -v --tb=short` | `pyproject.toml` |
    | Lint | `uv run ruff check . --fix` | `pyproject.toml` |
    | Type check | `uv run mypy app/ --strict` | `pyproject.toml` |
    | Migrate | `uv run alembic upgrade head` | `alembic/` |
    | Full verify | `ruff check . && pytest -v && mypy app/ --strict` | Before every commit |

**Self-Check:** every action has a copy-pasteable command | "Authority" points to config file | no linter rules restated in prose

---

## Exercise 3 — Judgment Boundaries

Write the three-tier system: **NEVER** (hard limits), **ASK** (pause for human), **ALWAYS** (proactive habits).

??? example "Reference Solution"

    **NEVER:** commit secrets/`.env`/credentials | run migrations without approval | add deps without discussion | force push to main | delete files to fix errors | guess on ambiguous specs

    **ASK:** before DB schema changes | before modifying CI config | before deleting files | when multiple valid approaches exist

    **ALWAYS:** explain plan before coding | run `ruff check . && pytest -v` after changes | handle all errors explicitly | write tests for new code

**Self-Check:** NEVER = irreversible/dangerous | ASK = judgment calls | ALWAYS = verifiable actions | no vague language

---

## Exercise 4 — Escalation + Definition of Done

Write escalation rules (what to do when blocked) and a Definition of Done (exit checklist).

??? example "Reference Solution"

    **Escalation:**

    - Tests fail 3× → stop, report full output and file path
    - Missing dep → check `pyproject.toml`, then ask before adding
    - Merge conflicts → stop, list files, never auto-resolve
    - Unknown build error → share full traceback, do not retry blindly
    - **Never**: delete files to fix errors, skip tests, force push

    **Definition of Done:**

    1. `ruff check .` exits 0
    2. `pytest -v` exits 0
    3. `mypy app/ --strict` exits 0
    4. No new `# type: ignore` or `# noqa` added
    5. Commit follows: `type(scope): description`

---

## Exercise 5 — Full AGENTS.md

Combine Exercises 1–4 into a complete file. Add `When…` task-organized sections. **Target: ≤ 150 lines.**

??? example "Reference Solution"

    ```markdown
    > **Project:** ShopAPI — RESTful e-commerce backend.
    > **Stack:** Python 3.12, FastAPI, PostgreSQL 16, Redis 7.
    > **Core constraint:** Idempotent endpoints; no duplicate orders.

    ## Toolchain
    | Action | Command | Authority |
    |---|---|---|
    | Test | `uv run pytest -v --tb=short` | `pyproject.toml` |
    | Lint | `uv run ruff check . --fix` | `pyproject.toml` |
    | Type check | `uv run mypy app/ --strict` | `pyproject.toml` |
    | Full verify | `ruff check . && pytest -v && mypy app/ --strict` | — |

    ## NEVER
    - Commit secrets or `.env`
    - Add dependencies without discussion
    - Force push to main/develop
    - Guess on ambiguous specs — stop and ask

    ## ASK
    - Before DB schema changes / migrations
    - Before deleting files
    - When multiple valid approaches exist

    ## ALWAYS
    - Explain plan before writing code
    - Run full verify after changes
    - Write tests for new code

    ## When Writing Code
    - Follow existing patterns in `app/`
    - Run `ruff check . --fix` after every file change

    ## When Reviewing Code
    - Run `bandit -r app/` for security
    - Verify coverage: `pytest --cov=app --cov-fail-under=80`

    ## Escalation
    - Tests fail 3× → stop, report full output
    - Missing dep → check pyproject.toml, then ask
    - Merge conflicts → stop, list files, never auto-resolve

    ## Definition of Done
    1. `ruff check .` exits 0  2. `pytest -v` exits 0  3. `mypy --strict` exits 0
    4. Commit: `type(scope): description`
    ```

---

## Exercise 6 — Monorepo Scoping

Design directory-scoped `AGENTS.md` files for this monorepo:

```text
repo/
├── AGENTS.md              ← root (shared rules)
├── services/
│   ├── api/               ← Python FastAPI
│   ├── web/               ← TypeScript React
│   └── worker/            ← Python Celery
└── packages/
    └── shared-types/      ← TypeScript
```

??? example "Reference Solution"

    **Root:** mission + "never import across service boundaries" + `make test-all` / `make lint-all`

    **`services/api/AGENTS.md`:** `uv run pytest` / `uv run ruff check` / `uv run alembic upgrade head` + "Pydantic in schemas/, SQLAlchemy in models/"

    **`services/web/AGENTS.md`:** `pnpm test` / `pnpm lint` / `pnpm build` + "Components PascalCase, hooks `use` prefix, types from `@shop/shared-types`"

**Self-Check:** root = shared rules only | service files extend, not duplicate | each ≤ 150 lines

---

## Audit Checklist

| # | Criterion |
|---|---|
| 1 | Total file ≤ 150 lines |
| 2 | Mission is 2–4 sentences |
| 3 | Every tool action has a copy-pasteable command |
| 4 | No linter/formatter rules restated in prose |
| 5 | NEVER / ASK / ALWAYS tiers present |
| 6 | Escalation covers: test fail, missing dep, conflict |
| 7 | Definition of Done uses commands, not opinions |
| 8 | No negative instructions — use tooling instead |
| 9 | No prose paragraphs — only tables, lists, commands |
| 10 | Agent can reproduce build commands verbatim |

---

## See also
- [AGENTS.md Standard](12-agents-md.md)
- [Cross-Agent Compatibility](06-cross-agent-compatibility.md)
- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [SKILL.md Playground](13-skill-playground.md)
