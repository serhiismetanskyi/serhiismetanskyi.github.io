---
date: 2026-06-26
updated: 2026-10-07
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
| `enabled` | Turn the sandbox on (Seatbelt on macOS, bubblewrap on Linux and WSL2) |
| `autoAllowBashIfSandboxed` | Auto-approve bash when sandbox is active (default `true`) |
| `excludedCommands` | Commands that run outside the sandbox (e.g. docker) |
| `allowUnsandboxedCommands` | Let Claude retry a failed command outside the sandbox after a prompt (default `true`) |
| `failIfUnavailable` | Refuse to start instead of running unsandboxed when the sandbox can't start |
| `filesystem.allowWrite` / `denyWrite` | Extra writable paths / paths that stay read-only |
| `filesystem.denyRead` / `allowRead` | Block reads to sensitive paths / re-allow a subpath |
| `network.allowedDomains` / `deniedDomains` | Outbound allowlist / blocklist (wildcards, optional `:port`) |
| `network.allowLocalBinding` | Let commands listen on localhost ports (dev servers) |
| `credentials.files` / `credentials.envVars` | Mask secrets from sandboxed commands |

All 38 sandbox keys: [Settings Reference — Sandbox settings](20-claude-code-settings-reference.md#sandbox-settings).

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
claude --permission-mode auto -p "fix all lint errors"
```

`--enable-auto-mode` was removed in v2.1.111: auto mode is in the **Shift+Tab** cycle by default, and from v2.1.283 it is the built-in starting mode for interactive terminal and VS Code sessions.

How auto mode decides, in order:

| Step | What happens |
|---|---|
| **1. Your rules** | Matching allow / ask / deny rules resolve first (protected paths and critical-path removals still go to the classifier or prompt) |
| **2. Safe actions** | Reads and file edits inside the working directory are approved without a classifier call |
| **3. Classifier** | Everything else is checked by a background safety classifier — blocks data exfiltration, mass deletion, scope escalation |
| **4. Block** | Claude gets the reason (e.g. `[Data Exfiltration]`) and tries another way; repeated blocks fall back to a prompt |

Tune it with the `autoMode` key (your own allow / deny rules for the classifier), `autoMode.classifyAllShell`, and `useAutoModeDuringPlan`; organizations turn it off with `"disableAutoMode": "disable"`.

---

## Enterprise Managed Settings

Centralized control for organizations:

| Delivery | Location |
|---|---|
| Server-managed | claude.ai admin console — no device management needed |
| macOS MDM | `com.anthropic.claudecode` managed preferences domain |
| Windows GPO / Intune | `Settings` value (JSON) under `HKLM\SOFTWARE\Policies\ClaudeCode` |
| File-based | `/etc/claude-code/managed-settings.json` (Linux, WSL), `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS), `C:\Program Files\ClaudeCode\managed-settings.json` (Windows) |

Managed settings cannot be overridden by user or project settings.

### Key Enterprise Controls

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable"
  },
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
| `model` | Override default model | `"opus"` or `"claude-opus-5-5"` |
| `effortLevel` | Default reasoning effort | `"high"` |
| `language` | Response language | `"japanese"` |
| `attribution` | Customize git commit attribution | `{"commit": "AI-generated", "pr": ""}` |
| `env` | Environment variables for every session | `{"FOO": "bar"}` |
| `autoUpdatesChannel` | `"stable"` (week-old) or `"latest"` | `"stable"` |
| `includeGitInstructions` | Disable built-in git workflow prompt | `false` |
| `plansDirectory` | Where plan files are stored | `"./plans"` |
| `cleanupPeriodDays` | Days to keep session transcripts (default 30) | `14` |
| `statusLine` | Custom status line command | `{"type": "command", "command": "~/.claude/statusline.sh"}` |

All 243 keys with scope, type and default: [Claude Code — Settings Reference](20-claude-code-settings-reference.md).

### JSON Schema Validation

Add to `settings.json` for IDE autocomplete:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json"
}
```

---

## See also
- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [Claude Code Hooks & Agents](08-claude-code-hooks-agents.md)
- [Claude Code Workflow Patterns](09-claude-code-workflow-patterns.md)
- [Model Context Protocol (MCP)](11-mcp-protocol.md)
- [Claude Code — Settings Reference](20-claude-code-settings-reference.md)
