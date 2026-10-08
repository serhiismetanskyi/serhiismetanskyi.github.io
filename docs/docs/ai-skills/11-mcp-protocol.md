---
date: 2026-06-26
updated: 2026-10-09
tags:
  - ai-agents
  - coding-agents
  - mcp
---

# Model Context Protocol (MCP)

MCP is an **open protocol** (Linux Foundation, Dec 2025) that standardizes how AI agents connect to external tools, data sources, and services — **"USB-C for AI integrations"**.

---

## Architecture

```text
┌──────────────────────────────┐
│  Host (IDE / Agent runtime)  │
│  ┌────────┐  ┌────────┐     │
│  │Client A│  │Client B│ ... │   1 host → N clients
│  └───┬────┘  └───┬────┘     │
└──────┼───────────┼──────────┘
       │           │
  ┌────▼───┐  ┌───▼────┐
  │Server 1│  │Server 2│  ...     Each server = 1 capability domain
  └────────┘  └────────┘
```

| Layer | Role |
|---|---|
| **Host** | LLM application (IDE, chat, CI runner) embedding one or more clients |
| **Client** | Connector inside the host; 1:1 stateful session with a server |
| **Server** | Lightweight process exposing tools, resources, or prompts |

---

## Core Primitives

| Primitive | Direction | Purpose | Example |
|---|---|---|---|
| **Tools** | Server → Client | Functions the model can invoke | `search_issues`, `run_query` |
| **Resources** | Server → Client | Read-only data by URI | `file:///schema.sql` |
| **Prompts** | Server → Client | Parameterized workflow templates | "Summarize this PR" |
| **Sampling** | Client → Server | Server asks LLM to generate | Recursive agentic loops |
| **Roots** | Client → Server | Filesystem/URI boundary queries | Project scope discovery |
| **Elicitation** | Client → Server | Request user information | Additional input |

---

## Transport

| Transport | Use Case | Status (2026) |
|---|---|---|
| **stdio** | Local server on same machine | Stable |
| **Streamable HTTP** | Cloud services, remote APIs | **Recommended** |
| SSE | Legacy bidirectional | **Deprecated** |

---

## Setup: Claude Code

```bash
claude mcp add --transport http stripe https://mcp.stripe.com
claude mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~/code
claude mcp add --transport http github --scope project https://api.githubcopilot.com/mcp/
```

| Scope | Flag | Location | Shared? |
|---|---|---|---|
| Local (default) | `--scope local` | `~/.claude.json`, under this project's path | private to you, this project only |
| Project | `--scope project` | `.mcp.json` (committed) | team (each user approves it once) |
| User | `--scope user` | `~/.claude.json` | all your projects |

```json
{
  "mcpServers": {
    "github": { "type": "http", "url": "https://api.githubcopilot.com/mcp/" },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/code"],
      "env": {}
    }
  }
}
```

Environment variables: `${VAR}` or `${VAR:-default}`. Never store secrets directly.

MCP tools appear in hook matchers as `mcp__<server>__<tool>` (e.g. `mcp__github__search_repositories`). A matcher with hyphens such as `mcp__brave-search` matches that exact name; use a regular expression (`mcp__brave-search__.*`) for the whole server.

### Day-to-day commands

| Command | Use |
|---|---|
| `claude mcp list` / `get <name>` | Show servers; unapproved `.mcp.json` servers appear as `⏸ Pending approval`, disabled ones as `⊘ Disabled` |
| `claude mcp login <name>` / `logout <name>` | Run or clear a server's OAuth flow from the shell (`--no-browser` over SSH) |
| `/mcp` | Panel with tool counts and authentication; `/mcp reconnect all` retries every failed server |
| `--mcp-config` / `--strict-mcp-config` | Load servers from JSON for one session / use only those |

### Behaviour worth knowing

- **Tool search**: tools from many servers are deferred and found on demand to save context. `"alwaysLoad": true` in a server's config keeps its tools loaded; `false` defers all of them.
- **Elicitation**: a server can ask you for structured input mid-task; an `Elicitation` hook can answer automatically, and `{"decision":"block"}` declines it.
- **Long calls**: an MCP tool call running over two minutes moves to the background (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`); a remote call that sits idle for five minutes is aborted (`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`).
- **Limits**: server instructions and tool descriptions are capped at 2,048 characters (`CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`); tools with names over 128 characters are left out.
- **Trust**: a project `.mcp.json` must be approved by each user, and `headersHelper` and inline agent MCP servers need folder trust.
- **Organizations**: `allowedMcpServers` / `deniedMcpServers` filter user-added servers, `managedMcpServers` provides HTTP/SSE servers to everyone, `allowManagedMcpServersOnly` and `managed-mcp.json` take exclusive control, and `disableClaudeAiConnectors` / `allowAllClaudeAiMcps` govern claude.ai connectors.

---

## Setup: Cursor

Config location: `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global).

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": { "POSTGRES_CONNECTION_STRING": "${POSTGRES_CONNECTION_STRING}" }
    }
  }
}
```

After editing `.cursor/mcp.json`, **fully restart Cursor** (quit + reopen). Requires Cursor v0.40+, Node.js 18+.

### Other Agents

| Agent | Config | Notes |
|---|---|---|
| **Copilot (VS Code)** | `.vscode/mcp.json` or settings | `inputs` for secret prompting |
| **Devin Desktop** (formerly Windsurf) | `~/.codeium/windsurf/mcp_config.json` | Similar JSON format; `~/.codeium/` paths unchanged after the rename |
| **Gemini CLI** | `~/.gemini/settings.json` → `mcpServers` | stdio + HTTP |

---

## Popular Servers

| Server | Type | Capability |
|---|---|---|
| **Filesystem** | Official | Secure file read/write with access controls |
| **Git** | Official | Repo read, search, diff, blame |
| **Memory** | Official | Knowledge-graph persistent memory |
| **PostgreSQL** | Official | Schema inspection and query execution |
| **GitHub** | Community | Issues, PRs, CI/CD, code search |
| **Playwright** | Community | Browser automation, testing |
| **Context7** | Community | Auto-fetches library documentation |
| **Figma** | Community | Design-to-code, token extraction |
| **Sentry** | Community | Error monitoring context |

The MCP registry lists **400+** servers with `npx`/`uvx` one-liner installs.

---

## Security

MCP spec mandates **OAuth 2.1 with PKCE** for remote public servers:

| Requirement | Detail |
|---|---|
| HTTPS | All endpoints must use TLS |
| PKCE | Mandatory for public servers |
| Audience validation | Tokens scoped per server (RFC 8707) |
| Scope minimization | Least-privilege per tool |
| User consent | Explicit approval for tool invocations |

For internal servers: mTLS or machine-to-machine OAuth client credentials. Tool descriptions are **untrusted** unless from a verified server.

---

## Building Custom Servers

| SDK | Install | Validation |
|---|---|---|
| **Python** | `uv add mcp` | Pydantic models |
| **TypeScript** | `npm install @modelcontextprotocol/sdk zod` | Zod schemas |

Both SDKs follow the same pattern: create a `Server`, register `list_tools` + `call_tool` handlers, connect via `StdioServerTransport` (local) or HTTP (remote). Test locally by pointing Claude Code or Cursor at the server via stdio.

---

## MCP vs Skills

| | Skill | MCP Server |
|---|---|---|
| **What** | Instructions + templates | External tools + data |
| **Runs** | Inside LLM context (tokens) | Outside LLM (deterministic) |
| **Trigger** | Intent matching / slash command | Agent calls a tool |
| **Cost** | Tokens (LLM reads instructions) | Tool/API call + response tokens in context |

A skill can **reference MCP tools** in its workflow — e.g. a "deploy" skill instructs the agent to call `mcp__vercel__deploy` then `mcp__slack__post_message`.

---

---

## See also
- [Claude Code Advanced Config](10-claude-code-advanced-config.md)
- [Cross-Agent Compatibility](06-cross-agent-compatibility.md)
- [Skill Packaging](03-skill-packaging.md)
- [Agentic AI Architecture: Tool Integration](../agentic-ai-architecture/04-tool-integration-prompting.md)
- [Claude Code — Mods, Artifacts, Channels & Remote Sessions](22-claude-code-mods-artifacts-remote.md)
