---
date: 2026-06-27
tags:
  - ai-agents
  - coding-agents
---

# SKILL.md Playground

Hands-on exercises for writing production-quality `SKILL.md` files. Each exercise builds on the previous one.

---

## Exercise 1 — Minimal SKILL.md

Create a `SKILL.md` for a skill that formats Python imports using `isort` conventions.

**Requirements:** `name` + `description` in YAML frontmatter, body with Workflow and Constraints.

??? example "Reference Solution"

    ```yaml
    ---
    name: python-import-sorter
    description: >-
      Sort and group Python imports following isort conventions.
      Use when asked to organize imports, fix import order,
      or clean up file headers in a Python project.
    ---
    ```

    ```markdown
    # Python Import Sorter

    ## Workflow
    1. Identify target files — if none specified, scan via `git diff --name-only`
    2. Group imports: stdlib → third-party → local, separated by blank lines
    3. Sort alphabetically within each group
    4. Run `ruff check --select I` to verify

    ## Constraints
    - NEVER reorder imports inside `TYPE_CHECKING` blocks
    - NEVER remove unused imports (separate concern)
    - Preserve existing `# noqa` comments on import lines
    ```

**Self-Check:** `name` is lowercase-hyphen ≤ 64 chars | `description` answers "what?" + "when?" | steps use concrete commands | constraints use NEVER/ALWAYS

---

## Exercise 2 — Anti-Rationalization Table

Add a `Common Rationalizations` section to Exercise 1. Write ≥ 4 excuses an agent might use to skip steps, with rebuttals.

??? example "Reference Solution"

    | Excuse | Rebuttal |
    |---|---|
    | "The file only has two imports" | Consistent ordering prevents merge conflicts regardless of count |
    | "I'll sort them after I finish the feature" | Import order is part of the change — sort before commit |
    | "The project doesn't use isort" | Apply the standard grouping; the pattern is universal |
    | "Relative imports don't need sorting" | Relative imports follow the same alphabetical rule within their group |

---

## Exercise 3 — Red Flags + Verification

Add **Red Flags** (observable symptoms of violation) and **Verification** (exit checklist with evidence).

??? example "Reference Solution"

    **Red Flags:** imports from `typing` mixed with third-party | no blank line between groups | `from __future__` not at the top | unused imports added during sorting

    **Verification:**

    - [ ] `ruff check --select I .` exits 0
    - [ ] `git diff` shows only import-line changes
    - [ ] Each file has ≤ 3 import groups
    - [ ] No new linter warnings introduced

---

## Exercise 4 — Full Production Skill

Build a complete `SKILL.md`. Pick one:

| Option | Description |
|---|---|
| **A** — `changelog-generator` | Generate CHANGELOG.md from git history (Conventional Commits) |
| **B** — `docker-healthcheck` | Add healthcheck directives to Dockerfiles |
| **C** — `test-coverage-reporter` | Analyze coverage gaps, suggest missing tests |

Required sections:

```text
SKILL.md
├── YAML Frontmatter (name, description, version)
├── Overview + When to Use / When NOT to Use
├── Workflow (numbered, concrete commands)
├── Constraints (NEVER / ALWAYS)
├── Common Rationalizations (≥ 4 rows)
├── Red Flags (≥ 3 items)
└── Verification (exit checklist with evidence)
```

??? example "Reference Solution (Option A)"

    ```yaml
    ---
    name: changelog-generator
    description: >-
      Generate or update CHANGELOG.md from git commit history using
      Conventional Commits. Use when asked to create a changelog,
      prepare a release, or document recent changes.
    version: 1.0.0
    ---
    ```

    **Workflow:** find latest tag → collect commits since tag → parse type/scope/desc → group (feat/fix/refactor/other) → format Markdown with date → prepend to CHANGELOG.md → show diff for approval

    **Constraints:** NEVER overwrite existing entries | NEVER include merge commits | ALWAYS use ISO 8601 dates | ALWAYS preserve content below new section

    **Rationalizations:** "only a few commits" → even one feature deserves an entry | "messages are messy" → use what exists, flag non-conventional as Other | "generate at release time" → incremental updates easier to review | "nobody reads changelogs" → changelogs debug regressions, not marketing

    **Verification:** CHANGELOG.md is valid Markdown | new section at top, previous untouched | every commit since tag appears once | date is ISO 8601

---

## Exercise 5 — Folder Layout

Design the directory structure for your Exercise 4 skill:

- Reference > 100 lines → `references/`
- Scripts for deterministic tasks → `scripts/`
- Templates for output → `templates/`
- Under 50 lines → keep inline

??? example "Reference Solution"

    ```text
    changelog-generator/
      SKILL.md
      scripts/parse_commits.py       ← git log → structured JSON
      templates/changelog_section.j2  ← Jinja2 template for release section
      references/conventional-commits-spec.md
    ```

---

## Audit Checklist

| # | Criterion |
|---|---|
| 1 | `name` is lowercase-hyphen, ≤ 64 chars |
| 2 | `description` covers **what** + **when** |
| 3 | Workflow uses numbered steps with concrete commands |
| 4 | Constraints use NEVER / ALWAYS (no "try to" or "be careful") |
| 5 | Anti-rationalization table has ≥ 4 rows |
| 6 | Red flags describe observable symptoms |
| 7 | Verification requires evidence (command output, file check) |
| 8 | No section duplicates what a linter/CI already enforces |
| 9 | Total SKILL.md ≤ 200 lines (heavy content in references/) |
| 10 | Directory name matches `name` field |

---

## See also
- [What Is a Skill](01-what-is-a-skill.md)
- [Skill Packaging](03-skill-packaging.md)
- [Evaluation & Security](05-evaluation-security.md)
- [AGENTS.md Playground](14-agents-md-playground.md)
