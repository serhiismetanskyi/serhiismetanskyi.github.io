---
date: 2026-06-28
tags:
  - ai-agents
  - coding-agents
---

# Skills Troubleshooting & Checklists

Operational checklist and failure playbook distilled from the Claude skills guide.

---

## Pre-Build Checklist

Before writing:
- define 2-3 concrete use cases
- identify tool dependencies (native/MCP)
- choose success metrics
- decide what stays in `SKILL.md` vs `references/`

During build:
- folder and `name` are kebab-case
- file is exactly `SKILL.md` (case-sensitive)
- frontmatter has valid `---` delimiters
- `description` includes both WHAT and WHEN
- no `<` or `>` in frontmatter fields
- instructions are actionable and ordered
- error handling exists for common failures

Before upload:
- obvious trigger queries work
- paraphrased trigger queries work
- unrelated queries do not trigger
- functional workflow passes end-to-end
- MCP tool calls succeed where expected

After rollout:
- monitor under/over-triggering
- collect real user queries and failures
- version metadata on each meaningful update

---

## Troubleshooting by Symptom

### Upload Fails

Common causes:
- missing/incorrect `SKILL.md` file name
- invalid YAML delimiters or quotes
- invalid `name` format (spaces/caps/underscores)

Fix path:
1. validate file name and exact casing
2. validate YAML formatting
3. normalize `name` to kebab-case

---

### Skill Does Not Trigger

Likely cause:
- vague or narrow `description`

Fix path:
1. add realistic trigger phrases users say
2. add domain terms and file-type context
3. re-test with paraphrases and near-neighbor requests

---

### Skill Triggers Too Often

Likely cause:
- scope too broad

Fix path:
1. narrow scope in `description`
2. add explicit negative triggers
3. split broad skill into focused skills

---

### MCP Calls Fail After Trigger

Likely causes:
- MCP not connected/authenticated
- wrong tool names
- missing permissions/scopes

Fix path:
1. verify MCP connection state
2. test tool call without skill
3. verify tool names and required parameters
4. add retry/fallback behavior in instructions

---

### Instructions Are Ignored or Partially Followed

Likely causes:
- verbose or ambiguous guidance
- critical rules buried deep in file

Fix path:
1. move critical constraints near top
2. rewrite vague lines into explicit checks
3. replace fragile language checks with deterministic scripts where possible

---

### Large Context / Slow Behavior

Likely causes:
- oversized `SKILL.md`
- too many active skills

Fix path:
1. keep core file compact (target under 5,000 words)
2. move long guidance into `references/`
3. reduce simultaneously enabled skills

---

## Proven Workflow Patterns

1. **Sequential orchestration**
   - strict order, dependencies, rollback notes
2. **Multi-MCP coordination**
   - phased execution, data handoff, central error policy
3. **Iterative refinement**
   - validate -> fix -> revalidate loop with exit criteria
4. **Context-aware tool selection**
   - choose tools by explicit decision logic
5. **Domain-specific intelligence**
   - enforce domain policy before taking actions

---

## Minimal Frontmatter Reference

```yaml
---
name: skill-name-in-kebab-case
description: What it does and when to use it, with trigger phrases.
metadata:
  version: 1.0.0
---
```

Use this as a baseline, then add optional fields only when needed by your environment.

---

## See also
- [Building Skills for Claude: Practical Playbook](17-building-skills-for-claude-playbook.md)
- [SKILL.md Universal Standard (2026)](16-skill-md-universal-standard.md)
- [SKILL.md Playground](13-skill-playground.md)
