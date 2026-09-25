---
date: 2026-06-25
tags:
  - ai-agents
  - coding-agents
  - security
  - evaluation
---

# Evaluation & Security

## Evaluation Strategy

Test skills at 3 levels:

1. **Contract tests**: input/output schema conformance
2. **Behavior tests**: task-specific correctness
3. **Policy tests**: security and compliance constraints

### Eval Spec Example

```json
{
  "skill_id": "git-commit-creator",
  "tests": [
    {
      "name": "blocks_secret_files",
      "input": {"repo_path": "/repo", "stage_all": true},
      "assertions": [
        "status == 'blocked'",
        "reason contains '.env'"
      ]
    },
    {
      "name": "generates_conventional_commit",
      "input": {"repo_path": "/repo"},
      "assertions": [
        "message starts with feat|fix|docs|refactor|test|chore",
        "subject line length <= 72"
      ]
    }
  ]
}
```

Evals shift the question from "did we produce something?" to "does it actually work?"

### What Evals Catch

- leftover placeholders (`{{PROJECT_NAME}}`)
- missing required sections
- hallucinated content or fabricated file names
- broken output structure
- policy violations (secrets, unsafe commands)

---

## Key Metrics

| Metric | Purpose |
|---|---|
| Success Rate | completed tasks / total tasks |
| Policy Violation Rate | blocked or unsafe executions |
| Mean Latency | routing + execution duration |
| Schema Error Rate | contract drift detection |
| User Override Rate | quality signal for routing confidence |

---

## Security Controls

### Mandatory Checks

- **Audit all skill files** before use: SKILL.md, scripts, references
- **Allowlist executable tools**: only declared tools can run
- **Secret scanning**: block commits/writes containing credentials
- **Least-privilege credentials**: read-only where writes are not needed
- **Argument sanitization**: validate every script/tool input
- **Execution timeout**: cap runtime per skill and per workflow

### Threat Model

| Threat | Example | Mitigation |
|---|---|---|
| Malicious skill | skill with hidden `curl` exfiltrating data | audit all files before install |
| Prompt injection via reference | reference file with override instructions | isolate reference content from system prompt |
| Unsafe script execution | `rm -rf /` in helper script | sandboxing + command allowlist |
| Dependency hijack | external URL changes content | vendor dependencies, pin versions |

### Governance

Every production skill needs:
- **owner/team** responsible for maintenance
- **review cadence** (quarterly minimum)
- **changelog** for every version
- **deprecation policy** with migration path

No owner → no production deployment.

---

## See also
- [AI Skills for Coding Agents](index.md)
- [AGENTS.md Standard](12-agents-md.md)
- [Orchestration & Workflows](04-orchestration-workflows.md)
- [Cross-Agent Compatibility](06-cross-agent-compatibility.md)
