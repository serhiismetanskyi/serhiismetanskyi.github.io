---
date: 2026-09-29
tags:
  - spec-driven-development
  - ai-agents
  - coding-agents
---

# SDD — Open Knowledge Format (OKF)

## What OKF Is

**Open Knowledge Format (OKF)** is an open specification from Google Cloud for giving AI agents curated context:
a **directory of markdown files with YAML frontmatter**, one concept per file, cross-linked into a graph.
Version 0.1 was published on 12 June 2026; the current version is **0.2**, maintained in the
`GoogleCloudPlatform/open-knowledge-format` repository (`SPEC.md`).

The format is deliberately minimal: no schema registry, no SDK, no runtime.
"If you can `cat` a file, you can read OKF; if you can `git clone` a repo, you can ship it."

| | |
|---|---|
| Unit of distribution | **Knowledge bundle** — a directory tree (git repo, tarball or a subfolder of a repo) |
| Unit of knowledge | **Concept** — one `.md` file; its path without `.md` is the concept ID |
| Required metadata | Only `type` |
| Relationships | Standard markdown links between concepts |
| Reserved files | `index.md` (directory listing), `log.md` (update history) |

## Why It Matters for SDD

A spec says **what to build**. Agents also need **what is already true**: domain terms, data definitions,
API contracts, business rules, runbooks. That knowledge usually lives in wikis, tickets and people's heads,
or gets pasted into prompts and `AGENTS.md` until they are too long to read.

| Artifact | Answers | Lifetime |
|---|---|---|
| `constitution.md` / `AGENTS.md` / steering | How we work: rules, style, constraints | Whole project |
| `spec.md`, `plan.md`, `tasks.md` | What to build now and how | One feature or change |
| Skills | How to do a task: procedure, scripts | Reused across tasks |
| **OKF bundle** | What the system and domain *are*: concepts, definitions, relationships | Long-lived, maintained |

So OKF fits the **spec-anchored** level of SDD: the spec references stable concepts
("order", "refund window", "`orders` table") instead of redefining them, and the agent loads only
the concepts it needs through the index — progressive disclosure, the same idea as skills.

## Bundle Structure

The directory layout is up to the producer. A typical layout in a repository next to the specs:

```
repo/
  AGENTS.md
  specs/
    001-refunds/spec.md
  knowledge/                 # OKF bundle
    index.md                 # optional, may carry okf_version
    log.md                   # optional
    glossary/
      index.md
      refund-window.md
    api/
      index.md
      post-refunds.md
    tables/
      orders.md
    playbooks/
      refund-failed-alert.md
```

`index.md` and `log.md` are reserved at every level and must not be used for concepts.
Every other `.md` file is a concept.

## Concept Documents

A concept is YAML frontmatter plus a markdown body.

```markdown
---
type: API Endpoint
title: Create refund
description: Starts a refund for a paid order inside the refund window.
resource: https://api.example.com/docs#post-/refunds
tags: [payments, refunds]
status: stable
generated: { by: human:ssmetanskyi, at: 2026-09-20T10:00:00Z }
---

# Schema

| Field      | Type   | Description                                   |
|------------|--------|-----------------------------------------------|
| `order_id` | string | Paid order, see [orders](/tables/orders.md).  |
| `amount`   | number | Must not exceed the captured amount.          |

# Examples

    POST /refunds {"order_id": "ord_123", "amount": 10.0}

Allowed only inside the [refund window](/glossary/refund-window.md).
```

**Frontmatter fields:**

| Field | Status | Meaning |
|---|---|---|
| `type` | **Required** | Kind of concept: `API Endpoint`, `Metric`, `Playbook`, `BigQuery Table`, … Not registered centrally; consumers must tolerate unknown types |
| `title` | Recommended | Display name; if missing, derived from the filename |
| `description` | Recommended | One sentence, used by indexes, search and previews |
| `resource` | Recommended | Canonical URI of the underlying asset; absent for abstract ideas |
| `tags` | Recommended | List of short strings for cross-cutting grouping |
| any other key | Allowed | Consumers must keep unknown keys and must not reject them |

**Body:** free markdown; structure (headings, tables, code blocks) is preferred over prose.
Conventional headings: `# Schema`, `# Examples`, `# Computation`.

## Trust, Provenance and Lifecycle (v0.2)

Most concepts in a real bundle are written or updated by agents. v0.2 adds optional fields that let a consumer
decide how far to trust a concept, without storing any "score".

| Field | Answers | Example |
|---|---|---|
| `sources` | What was this made from? | list of `{ id, resource, title, author, usage_count, last_modified }` |
| `generated` | Who wrote the current content, and when | `{ by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }` |
| `verified` | Who confirmed it against its sources | list of `{ by, at }`; a single mapping counts as a list of one |
| `status` | Is it current? | `draft`, `stable` (default), `deprecated` |
| `stale_after` | When does it expire? | absolute instant; stale when `now >= stale_after` |

**Actors** follow one convention: `<producer>/<version>` for agents and tools, `human:<id>` for people,
`process:<id>` for automated jobs.

**Trust tiers** are derived from `verified`:

- no `verified` → **unverified**
- only non-`human:` actors → **machine-confirmed**
- at least one `human:` actor → **human-reviewed**

A specific claim is attributed with a footnote whose label is a `sources[].id`:

```markdown
Refunds are allowed for 30 days after capture.[^refund-policy]

[^refund-policy]: Refund policy
```

All timestamps are ISO 8601 with an explicit offset, for example `2026-09-29T09:00:00Z`.

## Links, Indexes and Logs

**Links.** Concepts link with plain markdown. Two forms:

- bundle-relative, starting with `/` — recommended, survives moving files within a folder: `[orders](/tables/orders.md)`
- relative: `[neighbour](./other.md)`

A link means "related"; the kind of relationship is in the surrounding prose.
Broken links are allowed — they may point at knowledge nobody has written yet.

**`index.md`** lists a directory for progressive disclosure. No frontmatter, except the bundle root,
which may declare `okf_version: "0.2"`.

```markdown
# API

* [Create refund](post-refunds.md) - Starts a refund for a paid order inside the refund window.
* [Get refund](get-refund.md) - Returns the refund status.
```

**`log.md`** records changes, newest first, grouped under `## YYYY-MM-DD` headings:

```markdown
# Directory Update Log

## 2026-09-29
* **Update**: Added the 30-day limit to [Refund window](/glossary/refund-window.md).
* **Creation**: Described [Create refund](/api/post-refunds.md).
```

## Attested Computations

A concept with `type: Attested Computation` holds a **sanctioned way to compute a value** (SQL, dbt, Python),
so a consumer can check that the agent ran it instead of improvising its own query.

| Field | Meaning |
|---|---|
| `runtime` | Required for this type: `bigquery`, `postgres`, `dbt`, `python`, … Defines what parameters mean |
| `parameters` | Typed holes the agent may fill: `{ name, type, required }` |
| `computation` | Optional path to a file; otherwise the code block under `# Computation` |
| `executor` | `resource` (run instructions or code) and `receipt` (fields a run must return, e.g. `job_id`, `executed_sql`) |
| `attester` | `resource` — deterministic code, no LLM, that checks the receipt and returns a verdict |

The agent may only supply parameter **values**; it must not edit the computation.
`verified` confirms the *definition* still matches policy; attestation confirms a single *run*.
For QA this is the familiar split between reviewing a test oracle and checking one test result.

## Conformance

A bundle conforms to OKF v0.2 when:

1. every non-reserved `.md` file has parseable YAML frontmatter;
2. every frontmatter block has a non-empty `type`;
3. `index.md` and `log.md`, when present, follow their structure.

Consumers must **not** reject a bundle for missing optional fields, unknown types or keys,
broken links or missing `index.md` files. Consumers that don't know the declared version should still
try to read the bundle.

## QA Checks for a Bundle in CI

Knowledge that agents build on is test input. Check it like code:

- the bundle conforms (frontmatter, `type`)
- concepts past `stale_after` or marked `deprecated` are not referenced from active specs
- concepts that specs rely on are **human-reviewed**, not only machine-generated
- links from specs into the bundle resolve (broken links are legal in OKF, but a spec should not rely on one)

```python
# scripts/okf_check.py — conformance, staleness and trust tier of an OKF bundle
import pathlib
import sys
from datetime import UTC, datetime

import yaml

RESERVED = {"index.md", "log.md"}
bundle = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "knowledge")
now = datetime.now(UTC)
errors, warnings = [], []


def frontmatter(text):
    if not text.startswith("---\n"):
        return None
    head, sep, _ = text[4:].partition("\n---")
    return yaml.safe_load(head) if sep else None


def trust_tier(meta):
    verified = meta.get("verified")
    if not verified:
        return "unverified"
    events = verified if isinstance(verified, list) else [verified]  # a bare mapping is a list of one
    humans = any(str(e.get("by", "")).startswith("human:") for e in events)
    return "human-reviewed" if humans else "machine-confirmed"


for path in sorted(bundle.rglob("*.md")):
    if path.name in RESERVED:
        continue
    name = path.relative_to(bundle)
    try:
        meta = frontmatter(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        errors.append(f"{name}: invalid YAML ({exc})")
        continue
    if not isinstance(meta, dict) or not str(meta.get("type") or "").strip():
        errors.append(f"{name}: no frontmatter or empty 'type'")
        continue
    stale = meta.get("stale_after")
    if isinstance(stale, datetime) and now >= stale:  # PyYAML reads ISO 8601 with an offset as datetime
        warnings.append(f"{name}: stale since {stale:%Y-%m-%d}")
    if meta.get("status") == "deprecated":
        warnings.append(f"{name}: deprecated")
    if trust_tier(meta) == "unverified":
        warnings.append(f"{name}: unverified")

for line in [f"ERROR {e}" for e in errors] + [f"WARN  {w}" for w in warnings]:
    print(line)
print(f"{len(errors)} errors, {len(warnings)} warnings")
raise SystemExit(1 if errors else 0)
```

Errors (non-conformance) fail the build; staleness and trust are warnings, because OKF treats them as
advisory. Make them errors only for the concepts your specs actually depend on.

## Using OKF With a Coding Agent

- Put the bundle in the repository (`knowledge/`) and point to its root `index.md` from `AGENTS.md` / `CLAUDE.md`.
- In specs, **link to concepts instead of restating them**: `refund is allowed inside the [refund window](../../knowledge/glossary/refund-window.md)`. One definition, many specs.
- Let the agent write new concepts as `status: draft` with `generated.by` set to the agent;
  a person reviews them and adds `verified: { by: human:<id>, at: … }`.
- When a spec changes a business rule, update the concept in the same pull request and add a `log.md` entry —
  otherwise the bundle drifts the same way specs do.
- Don't move everything into OKF: rules of work stay in `AGENTS.md`, procedures in skills,
  feature intent in specs.

---
## See also
- [Spec-Driven Development](index.md)
- [SDD — Concepts & Workflow](01-concepts-workflow.md)
- [SDD — Tools](03-tools.md)
- [AI Skills for Coding Agents](../ai-skills/index.md)
