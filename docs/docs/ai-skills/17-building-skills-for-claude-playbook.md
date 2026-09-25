---
date: 2026-06-28
tags:
  - ai-agents
  - coding-agents
---

# Building Skills for Claude: Practical Playbook

Condensed guide with the most important ideas from the "The Complete Guide to Building Skills for Claude" document.

Source document:
- [The Complete Guide to Building Skills for Claude (LinkedIn PDF)](https://media.licdn.com/dms/document/media/v2/D4D1FAQGQUYzLsCre5w/feedshare-document-pdf-analyzed/B4DZ1Db_xXI0Ac-/0/1774952907546?e=1777507200&v=beta&t=Cf6DaHuLikpi2NYXpkqFo1uYl0ykBNmX2IM6igdWUO0)

---

## What a Skill Is

A skill is a folder with reusable instructions that teach Claude how to execute a specific workflow consistently.

Minimal structure:

```text
your-skill/
├── SKILL.md                 # required
├── scripts/                 # optional deterministic helpers
├── references/              # optional long docs/checklists
└── assets/                  # optional templates/examples
```

Core principles:
- **Progressive disclosure**: frontmatter -> full instructions -> linked files on demand
- **Composability**: skills should work together, not assume exclusivity
- **Portability**: same skill format works across Claude surfaces

---

## Start With Use Cases, Not Files

Before writing `SKILL.md`, define 2-3 concrete outcomes:
- what user wants to achieve
- required workflow steps
- tools needed (native + MCP if relevant)
- domain rules to embed

Template:
- **Use case**: what outcome is produced
- **Trigger**: phrases users actually say
- **Steps**: ordered workflow
- **Result**: measurable end state

---

## Three High-Value Skill Categories

1. **Document/asset creation**
   - standardized output, templates, style consistency
2. **Workflow automation**
   - multi-step flows with validation gates and iteration loops
3. **MCP enhancement**
   - converts raw tool access into guided workflows

MCP gives tool connectivity. Skills provide workflow intelligence.

---

## The Frontmatter Is the Router

The most important field is `description` because it controls activation.

Minimal frontmatter:

```yaml
---
name: your-skill-name
description: What it does. Use when user asks to [specific phrases].
---
```

Required quality:
- `name`: kebab-case only, match folder name
- `description`: include both WHAT + WHEN
- include realistic trigger phrases
- be specific enough to prevent over-triggering
- avoid forbidden characters (`<` and `>`)

Useful optional fields:
- `license`
- `compatibility`
- `metadata` (author, version, mcp-server, tags)
- `allowed-tools` (when platform supports it)

---

## Instruction Design That Works

Use a task-oriented structure:
1. clear step-by-step workflow
2. concrete commands/examples
3. expected output per step
4. troubleshooting for common failures
5. references to long docs in `references/`

Writing rules:
- prefer explicit actions over generic language
- put critical constraints early
- include error handling and retries
- keep core file concise, move heavy docs out

---

## Success Criteria and Evaluation

Use both quantitative and qualitative checks.

Quantitative baseline:
- ~90% triggering on relevant requests
- reduced tool calls/tokens vs baseline flow
- near-zero failed API calls in normal paths

Qualitative baseline:
- minimal user steering
- consistent outputs across repeated runs
- low correction rate from new users

Recommended test matrix:
- **Trigger tests**: should trigger + should not trigger
- **Functional tests**: valid outputs, edge cases, error handling
- **Performance tests**: compare with/without skill

---

## Iteration Signals

Under-triggering signals:
- users manually force invocation
- skill often not selected when expected

Fix:
- expand trigger vocabulary in `description`
- include domain terms users use in practice

Over-triggering signals:
- skill loads for unrelated tasks

Fix:
- narrow scope language
- add negative triggers ("do not use for ...")

Execution-quality signals:
- inconsistent outputs, retries, user corrections

Fix:
- refine instruction order
- add deterministic validation scripts
- improve failure handling paths

---

## Distribution Model (2026)

Current practical flow:
1. host skill repo publicly (for discoverability)
2. provide install + quick-start instructions
3. connect skill docs with MCP docs (if applicable)

For API scenarios:
- manage skills via `/v1/skills`
- pass skills in Messages API container settings
- use API for production-scale automation

Positioning best practice:
- describe outcomes and user value, not internal implementation details.

---

## See also
- [AI Skills for Coding Agents](index.md)
- [How Agents Load Skills](02-how-agents-load-skills.md)
- [Skill Packaging](03-skill-packaging.md)
- [Skills Troubleshooting & Checklists](18-skills-troubleshooting-checklists.md)
