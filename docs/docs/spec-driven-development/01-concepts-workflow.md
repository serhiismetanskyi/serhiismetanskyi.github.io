---
date: 2026-09-25
tags:
  - spec-driven-development
  - ai-agents
  - coding-agents
---

# SDD — Concepts & Workflow

## What Is Spec-Driven Development

Thoughtworks Technology Radar describes SDD as workflows that "begin with a structured functional specification,
then proceed through multiple steps to break it down into smaller pieces, solutions and tasks."

A **spec** in this sense is (Birgitta Böckeler, martinfowler.com):
- **structured** — fixed sections, IDs, acceptance criteria
- **behaviour-oriented** — describes what the software does, not how the code looks
- **written in natural language**
- **guidance for an AI coding agent** — the agent reads it, plans from it and implements it

The term became mainstream in 2025: AWS **Kiro** shipped a spec mode (GA November 2025) and GitHub released
**Spec Kit** (September 2025). Today most coding agents support some form of it — from dedicated toolkits
to a plain `SPEC.md` written in plan mode.

## How SDD Differs From Other Practices

| Practice | Main artifact | Written for | Relation to SDD |
|---|---|---|---|
| **Vibe coding** | A prompt | The agent, once | SDD replaces "describe a goal and hope" with a reviewed contract |
| **Classic spec / RFC / design doc** | Document for humans | Reviewers, future team | SDD specs are written for a "literal-minded pair programmer" and are broken down into tasks the agent executes |
| **TDD** | Failing unit test | Developer | SDD sits upstream; its tasks can require tests first |
| **BDD** | Gherkin scenarios (`.feature`) | Business + dev + QA | SDD acceptance criteria are often Given/When/Then — they map almost 1:1 to BDD scenarios |

Important gap noted in Martin Fowler's fragments: most teams write the spec and stop.
"The spec document is the blueprint. The safety net is the test suite." A spec only protects you once
it is turned into tests that enforce it.

## Three Levels of SDD

Böckeler distinguishes three levels by how long the spec lives and who edits what:

| Level | What happens to the spec | Who edits the code | Example tools |
|---|---|---|---|
| **Spec-first** | Written before the task, used for that task | Agent + human | Kiro, Spec Kit |
| **Spec-anchored** | Kept after the task, used for evolution and maintenance | Agent + human | Spec Kit (aspiration), OpenSpec (living specs), Tessl |
| **Spec-as-source** | The spec *is* the source; only the spec is edited | Nobody by hand — generated code is marked "DO NOT EDIT" | Tessl (goal) |

Most teams today work at **spec-first**, moving towards **spec-anchored** for long-lived features.
Spec-as-source repeats ideas of model-driven development — and its known problems: inflexibility and,
with LLMs, non-determinism.

## The Workflow

The exact steps differ by tool, but the shape is the same:

| Phase | Question it answers | Typical artifact |
|---|---|---|
| **Principles** | What rules apply to every change? | `constitution.md`, `AGENTS.md`, steering files |
| **Specify** | *What* are we building and *why*? | `spec.md` / `requirements.md` — user stories, acceptance criteria, edge cases |
| **Clarify** | What is still ambiguous? | Answers to `[NEEDS CLARIFICATION]` markers |
| **Plan** | *How* will we build it? | `plan.md` / `design.md` — stack, architecture, data model, contracts |
| **Tasks** | In which small steps? | `tasks.md` — ordered, traceable to requirements |
| **Implement** | — | Code and tests |
| **Verify** | Does the code match the spec? | Test results, consistency report, new tasks for gaps |

How tools name the phases:

| Tool | Phases |
|---|---|
| **GitHub Spec Kit** | constitution → specify → *clarify* → plan → *checklist* → tasks → *analyze* → implement → converge |
| **AWS Kiro** | requirements (or bug analysis) → design → tasks |
| **OpenSpec** | explore → propose → apply → archive |
| **Claude Code best practices** | explore → plan → implement → commit |

*Italic* steps are optional quality gates.

**Key rule:** separate *what & why* (spec) from *how* (plan). Spec Kit keeps technology choices out of the
spec on purpose and puts them in the plan and the constitution.

## Artifacts and Folder Layouts

**GitHub Spec Kit**

```text
.specify/
└── memory/
    └── constitution.md          # project principles
specs/
└── 001-photo-albums/            # one folder per feature
    ├── spec.md                  # what & why
    ├── plan.md                  # how
    ├── research.md
    ├── data-model.md
    ├── quickstart.md
    ├── contracts/               # API contracts
    ├── checklists/
    │   └── requirements.md      # requirements-quality checklist
    └── tasks.md
```

**AWS Kiro**

```text
.kiro/
├── steering/                    # always-on project guidance
│   ├── product.md
│   ├── tech.md
│   └── structure.md
└── specs/
    └── user-auth/
        ├── requirements.md      # EARS requirements (or bugfix.md)
        ├── design.md
        └── tasks.md
```

**OpenSpec**

```text
openspec/
├── specs/                       # living specs: the current truth
└── changes/
    └── add-dark-mode/           # one folder per change
        ├── proposal.md
        ├── specs/               # delta specs: ADDED / MODIFIED / REMOVED requirements
        ├── design.md
        └── tasks.md
```

When a change is archived, its delta specs are merged into `openspec/specs/` — the spec stays up to date.

## Main Claims and Criticisms

| Claims | Criticisms |
|---|---|
| Intent is captured before code, so the agent builds the right thing | One heavy workflow for every problem size — a small bug becomes a ceremony |
| Specs are reviewable and versioned in git | Long, repetitive markdown is hard to review — "I'd rather review code than all these markdown files" |
| The agent has long-term memory of decisions | False sense of control — the agent may still not follow all instructions |
| Acceptance criteria give QA a direct basis for tests | Full upfront specs assume you learn nothing during implementation (Kent Beck) |
| Works across agents and tools (plain markdown) | Risk of relearning that hand-crafted rules don't scale (Thoughtworks) |

---
## Sources
- Thoughtworks Technology Radar — [Spec-driven development](https://www.thoughtworks.com/en-us/radar/techniques/spec-driven-development) (Nov 2025)
- Birgitta Böckeler — [Understanding Spec-Driven Development: Kiro, spec-kit, and Tessl](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) (Oct 2025)
- Martin Fowler — Fragments [2026-01-08](https://martinfowler.com/fragments/2026-01-08.html), [2026-03-26](https://martinfowler.com/fragments/2026-03-26.html)
- GitHub Blog — [Spec-driven development with AI: get started with a new open source toolkit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/) (Sep 2025)
- [GitHub Spec Kit](https://github.com/github/spec-kit), [Kiro docs — Specs](https://kiro.dev/docs/specs/), [OpenSpec](https://github.com/Fission-AI/OpenSpec)
- Claude Code — [Best practices](https://code.claude.com/docs/en/best-practices)

## See also
- [Spec-Driven Development](index.md)
- [SDD — Writing Good Specs](02-writing-specs.md)
- [SDD — Tools](03-tools.md)
- [AI Skills for Coding Agents](../ai-skills/index.md)
