---
date: 2026-09-25
tags:
  - spec-driven-development
  - testing
  - qa
---

# SDD — QA, Testing & Best Practices

## Why SDD Matters for QA

In spec-driven development the spec already contains what QA needs most: **acceptance criteria with IDs**.
That gives QA three jobs:

1. **Test the spec** — review requirements before any code exists (cheapest bugs to fix).
2. **Turn acceptance criteria into tests** — so the spec is enforced, not just documented.
3. **Verify the code against the spec** — every requirement implemented and tested, nothing outside scope changed.

> "The spec document is the blueprint. The safety net is the test suite." — quoted in Martin Fowler's fragments

## From Acceptance Criteria to Tests

Given/When/Then scenarios map almost directly to BDD scenarios or test names:

```markdown
**FR-002**: System MUST reject duplicate album names

1. **Given** an album "Trip" exists, **When** the user creates another album "Trip",
   **Then** they see "An album with this name already exists"
```

```python
import pytest


@pytest.mark.requirement("FR-002")
def test_duplicate_album_name_is_rejected(api, album_factory):
    album_factory(name="Trip")

    response = api.post("/albums", json={"name": "Trip", "photo_ids": [1, 2]})

    assert response.status_code == 409
    assert response.json()["message"] == "An album with this name already exists"
```

Register the marker once so pytest doesn't warn:

```toml title="pyproject.toml"
[tool.pytest.ini_options]
markers = ["requirement(id): links a test to a spec requirement"]
```

EARS requirements map the same way — `WHEN <event> THE SYSTEM SHALL <behaviour>` becomes
*arrange the condition → trigger the event → assert the behaviour*. Kiro goes one step further and generates
**property-based tests** from EARS requirements (useful evidence, but "evidence rather than proof", and a poor fit
for external services or non-deterministic behaviour).

## Traceability

Keep one chain from requirement to result:

```
FR-002 (spec.md) ──► T014 [US1] (tasks.md) ──► test_duplicate_album_name_is_rejected ──► CI result
```

- Requirements have IDs (`FR-001`, `SC-001`), tasks have IDs and story tags (`T014 [US1]`)
- Tests reference requirement IDs (marker, test name or docstring)
- A small script or report can list **requirements without tests** — that is your coverage gap

```python
# scripts/spec_coverage.py — requirements from spec.md vs requirement markers in tests
import pathlib
import re

spec = pathlib.Path("specs/001-photo-albums/spec.md").read_text()
required = set(re.findall(r"\*\*(FR-\d{3})\*\*", spec))

tests = "\n".join(p.read_text() for p in pathlib.Path("tests").rglob("test_*.py"))
covered = set(re.findall(r'requirement\("(FR-\d{3})"\)', tests))

missing = sorted(required - covered)
print("Requirements without tests:", missing or "none")
raise SystemExit(1 if missing else 0)
```

## Verifying Code Against the Spec

| Check | How |
|---|---|
| Artifacts are consistent | Spec Kit `analyze` — read-only check across spec, plan and tasks |
| Code matches the spec | Spec Kit `converge` (adds tasks for gaps); OpenSpec `/opsx:verify` |
| Independent review | A separate reviewer agent/sub-agent compares the diff with the spec — avoids the implementing agent grading its own work |
| Scope | Nothing outside the listed files/interfaces changed |
| Acceptance | All tests linked to requirements pass; success criteria measured |

Spec Kit's `tasks` template makes test tasks (contract, integration) come **before** implementation — but only
if tests are requested. Ask for them explicitly in the constitution: *"every functional requirement has an automated test"*.

## Spec Review as a QA Activity

Treat the spec like a test object:

- **Ambiguity** — could two people implement this differently? → ask, mark `[NEEDS CLARIFICATION]`
- **Testability** — can you write a pass/fail check? "Fast" is not testable; "under 2 seconds at p95" is
- **Completeness** — errors, empty states, permissions, limits, concurrency, negative cases
- **Consistency** — no contradictions between requirements, stories and success criteria
- **Scope** — non-goals are written down

Spec Kit's `checklist` command produces requirements-quality checklists (`CHK001…`). A checked box means the
*requirement* is good — not that the feature is implemented.

## Best Practices

| Practice | Why |
|---|---|
| **Scale the process to the change** — skip the spec if the diff fits in one sentence | Avoids ceremony for small fixes |
| **Many small feature specs**, stored in the repo next to the code | One mega-spec is unreadable and goes stale |
| **Separate what/why from how** | Specs stay stable when technology changes |
| **Review one step at a time** — spec, then plan, then tasks | Mistakes are cheaper early |
| **Implement in a fresh context** | The agent works from the spec, not from a long chat |
| **Give the agent a runnable check** — tests, build, linters | "If you can't verify it, don't ship it" |
| **Keep specs alive** — update the spec when requirements change (Kiro *Sync Files*, OpenSpec archive) | Prevents spec drift |
| **Keep rule files short** — `CLAUDE.md`, `AGENTS.md`, steering | Long files get ignored |

## Anti-Patterns

| Anti-pattern | Symptom | Fix |
|---|---|---|
| Waterfall spec | Everything specified upfront, nothing learned during implementation | Iterate: spec → build a slice → update the spec |
| Markdown nobody reads | Long, repetitive specs approved without review | Shorter specs, IDs, review checklist |
| Spec as a guarantee | "It's in the spec, so the code does it" | Tests linked to requirements, independent review |
| Spec without tests | Acceptance criteria never become checks | Requirement → test traceability, coverage report |
| Spec drift | Code changed, spec didn't | Update spec in the same PR; living specs |
| Tech details in the spec | Spec breaks when the stack changes | Move the *how* into the plan |
| Chasing every review finding | Over-engineering | Fix what matters for the requirements |

## When Not to Use SDD

- Typos, one-line fixes, small refactors — describe the change and do it
- Exploration and prototypes — vibe code first, write a spec when you know what you want
- Behaviour you can't specify well yet — spike first, then specify
- When nobody will review the spec — the process adds cost without the benefit

---
## Sources
- Martin Fowler — Fragments [2026-01-08](https://martinfowler.com/fragments/2026-01-08.html), [2026-03-26](https://martinfowler.com/fragments/2026-03-26.html)
- Birgitta Böckeler — [Understanding Spec-Driven Development](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) (Oct 2025)
- Kiro — [Correctness](https://kiro.dev/docs/specs/correctness/), [Best practices](https://kiro.dev/docs/specs/best-practices/)
- GitHub Spec Kit — [templates](https://github.com/github/spec-kit/tree/main/templates), [commands](https://github.github.io/spec-kit/reference/agentic-sdd.html)
- [OpenSpec](https://github.com/Fission-AI/OpenSpec)
- Claude Code — [Best practices](https://code.claude.com/docs/en/best-practices)
- Thoughtworks Technology Radar — [Spec-driven development](https://www.thoughtworks.com/en-us/radar/techniques/spec-driven-development)

## See also
- [Spec-Driven Development](index.md)
- [SDD — Writing Good Specs](02-writing-specs.md)
- [QA & Testing Methodology](../qa-methodology/index.md)
- [Testing Pyramid](../testing-pyramid/index.md)
- [Test Design Techniques](../test-design-techniques/index.md)
