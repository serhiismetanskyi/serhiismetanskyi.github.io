---
date: 2026-06-26
tags:
  - ai-agents
  - coding-agents
---

# Claude Code Advanced Configuration

## Sandbox — OS-Level Isolation

Sandbox restricts filesystem and network access for all bash commands:

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["docker *"],
    "filesystem": {
      "allowWrite": ["/tmp/build", "~/.kube"],
      "denyRead": ["~/.aws/credentials"]
    },
    "network": {
      "allowedDomains": ["github.com", "*.npmjs.org"],
      "allowLocalBinding": true
    }
  }
}
```

| Setting | Purpose |
|---|---|
| `autoAllowBashIfSandboxed` | Auto-approve bash when sandbox is active |
| `excludedCommands` | Commands that bypass sandbox (e.g. docker) |
| `filesystem.allowWrite` | Additional writable paths |
| `filesystem.denyRead` | Block reads to sensitive paths |
| `network.allowedDomains` | Outbound network whitelist |

---

## Plugins

Plugins bundle skills, hooks, subagents, and MCP servers into a single installable unit:

```bash
/plugin                           # browse marketplace
/plugin marketplace add acme-corp/plugins
```

### Plugin Settings

```json
{
  "enabledPlugins": {
    "formatter@acme-tools": true,
    "deployer@acme-tools": true
  },
  "extraKnownMarketplaces": {
    "acme-tools": {
      "source": {
        "source": "github",
        "repo": "acme-corp/claude-plugins"
      }
    }
  }
}
```

---

## MCP Servers

Model Context Protocol servers extend Claude with external tools:

```bash
claude mcp add                    # connect a new MCP server
```

| MCP Server | What It Provides |
|---|---|
| **Context7** | Auto-fetches library documentation |
| **Chrome DevTools** | Live browser state, DOM, console, network |
| **PostgreSQL** | Database schema and query results |
| **GitHub** | Issues, PRs, and repository context |
| **Filesystem** | File access and search |

MCP tools appear in hook matchers as `mcp__<server>__<tool>`:
- `mcp__memory__create_entities`
- `mcp__github__search_repositories`

---

## Non-Interactive Mode

Run Claude without a session for CI, scripts, and automation:

```bash
claude -p "Explain what this project does"
claude -p "List all API endpoints" --output-format json
claude -p "Analyze this log" --output-format stream-json
```

### Fan-Out Pattern

Distribute work across parallel invocations:

```bash
for file in $(cat files.txt); do
  claude -p "Migrate $file from React to Vue. Return OK or FAIL." \
    --allowedTools "Edit,Bash(git commit *)"
done
```

### Auto Mode for Unattended Execution

```bash
claude --enable-auto-mode          # enable once
claude --permission-mode auto -p "fix all lint errors"
```

Auto Mode uses a **background safety classifier** that runs independently on every action:

| Layer | What It Does |
|---|---|
| **Input** | Scans tool outputs for prompt injection before they enter agent context |
| **Output** | Evaluates each action via transcript classifier — blocks mass deletion, data exfiltration, scope escalation |

Availability depends on plan and workspace policy. It is designed to reduce approval fatigue while still blocking destructive operations.

---

## Enterprise Managed Settings

Centralized control for organizations:

| Delivery | Location |
|---|---|
| Server-managed | Anthropic admin console |
| macOS MDM | `com.anthropic.claudecode` managed preferences |
| Windows GPO | `HKLM\SOFTWARE\Policies\ClaudeCode` |
| File-based | `/etc/claude-code/managed-settings.json` (Linux) |

Managed settings cannot be overridden by user or project settings.

### Key Enterprise Controls

```json
{
  "disableBypassPermissionsMode": "disable",
  "disableAutoMode": "disable",
  "allowManagedHooksOnly": true,
  "allowManagedPermissionRulesOnly": true,
  "strictKnownMarketplaces": [
    { "source": "github", "repo": "acme-corp/approved-plugins" }
  ]
}
```

---

## Useful Settings Reference

| Setting | Purpose | Example |
|---|---|---|
| `model` | Override default model | `"claude-sonnet-4-6"` |
| `language` | Response language | `"japanese"` |
| `attribution` | Customize git commit attribution | `{"commit": "AI-generated", "pr": ""}` |
| `env` | Environment variables for every session | `{"FOO": "bar"}` |
| `autoUpdatesChannel` | `"stable"` (week-old) or `"latest"` | `"stable"` |
| `includeGitInstructions` | Disable built-in git workflow prompt | `false` |
| `plansDirectory` | Where plan files are stored | `"./plans"` |

### JSON Schema Validation

Add to `settings.json` for IDE autocomplete:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json"
}
```

---

## References

- [Claude Code Settings](https://code.claude.com/docs/en/settings)
- [Configure Permissions](https://code.claude.com/docs/en/permissions)
- [Sandboxing](https://code.claude.com/en/sandboxing)
- [MCP Servers](https://code.claude.com/en/mcp)
- [Plugins](https://code.claude.com/en/plugins)

---

## See also
- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [Claude Code Hooks & Agents](08-claude-code-hooks-agents.md)
- [Claude Code Workflow Patterns](09-claude-code-workflow-patterns.md)
- [Model Context Protocol (MCP)](11-mcp-protocol.md)
