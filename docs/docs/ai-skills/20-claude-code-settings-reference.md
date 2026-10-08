---
date: 2026-10-07
tags:
  - ai-agents
  - coding-agents
  - claude-code
---

# Claude Code — Settings Reference

Every key Claude Code reads from `settings.json` (and the few it keeps in `~/.claude.json`), grouped by topic: where the key may go, its type, its default and what it does. The list was checked against **Claude Code 2.1.293** (October 2026) and the official [settings reference](https://code.claude.com/docs/en/settings-reference): **243 keys**, of which 237 are active and 6 are deprecated or removed.

!!! tip "Check your version first"
    Settings change fast: dozens of keys on this page did not exist in spring 2026 builds. Run `claude --version`, update with `claude update`, and look for the *(v2.1.x+)* note next to a key before relying on it. An unknown key is ignored, not reported as an error.

## Where Settings Live

| Scope | File | Applies to | Typical content |
|---|---|---|---|
| **Managed** | `managed-settings.json`, MDM / registry policy, or server-managed settings from the claude.ai console | Everyone the organization deploys it to | Security policy, model allowlists, MCP and plugin restrictions |
| **User** | `~/.claude/settings.json` | You, in every project on this machine | Theme, editor mode, default model, personal permission rules |
| **Shared project** | `.claude/settings.json` | Everyone working in the repository (commit it) | Team permissions, hooks, plugins, project `env` |
| **Project local** | `.claude/settings.local.json` | You, in this project only (kept out of git) | Personal overrides, experiments before sharing |
| **Global config** | `~/.claude.json` | You | Sign-in, MCP servers added with `claude mcp add`, per-project trust, and the [global config keys](#global-config-settings) |

Managed settings files by OS: `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS), `/etc/claude-code/managed-settings.json` (Linux and WSL), `C:\Program Files\ClaudeCode\managed-settings.json` (Windows). `CLAUDE_CONFIG_DIR` moves everything under `~/.claude` elsewhere.

There is **no** `~/.claude/settings.local.json`: "local" exists only per project.

## Precedence

Highest first — a key set higher overrides the same key lower:

1. **Managed settings** — nothing below overrides them.
2. **Command line** — `claude --settings <file-or-json>` for one session.
3. **Project local** — `.claude/settings.local.json`.
4. **Shared project** — `.claude/settings.json`.
5. **User** — `~/.claude/settings.json`.

- **Lists merge** instead of overriding: `permissions.allow` from user, project and local files are combined. Exceptions: `fallbackModel` and `modelPicker` take the whole value from the highest source; a managed `availableModels` replaces lower lists; `modelSettings` resolves per model.
- **Hooks merge** too: lower levels add hooks, they cannot remove managed ones.
- **Environment variables are not a level.** Each variable/key pair has its own rule: `ANTHROPIC_MODEL` beats the `model` key from any file, and `--model` beats both.
- **Stricter values win for a few keys** even against managed settings, for example `disableClaudeAiConnectors: true`, `enableArtifact: false`, `isolatePeerMachines: true` and a lower `maxEffortLevel` from any scope.
- **"User / Managed" keys** in the tables below are ignored in `.claude/settings.json` — a cloned repository must not be able to switch them on for you.

## Changing and Checking Settings

```bash
claude --settings ./ci-settings.json -p "run the tests"    # one session, from a file
claude --settings '{"model": "sonnet"}'                    # one session, inline JSON
```

- `/config` — interactive menu; writes user settings or `~/.claude.json` for you.
- `/status` — shows which settings sources loaded, including the managed one.
- `/permissions`, `/hooks`, `/mcp`, `/model`, `/effort`, `/theme`, `/statusline` — focused editors for one area.
- Settings files are **watched and reloaded**: edits to `permissions`, `hooks` or `apiKeyHelper` reach the running session. A few keys are read only at start — switch `model` with `/model` and effort with `/effort` instead.
- **Broken file**: invalid JSON or a rejected value opens a *Settings Error* dialog at startup; a single bad entry (a malformed rule, an unknown hook event) is skipped with a *Settings Warning*. `claude doctor` lists everything that was dropped — the only way to see it after a `-p` run.
- Add `"$schema": "https://json.schemastore.org/claude-code-settings.json"` at the top of a settings file for autocomplete and validation in the editor.

**Scope column legend:** *Any* — user, project, local or managed file; *User / Managed* — not honoured in `.claude/settings.json`; *User / Local / Managed* — not honoured in the shared project file; *Managed* — only from managed settings; *`~/.claude.json`* — only from the global config file.

## Model and responses

Which model runs, how hard it thinks, how it answers, and which models an organization allows.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `advisorModel` | Any | `"fable"` / `"opus"` / `"sonnet"` / model ID | unset | Pick which model answers when Claude asks the advisor tool |
| `alwaysThinkingEnabled` | Any | bool | unset | Turn extended thinking off for every session |
| `availableModels` | Any | array of models | unset | Restrict which models people can pick |
| `availableModelsMatch` | Managed | `"prefix"` / `"exact"` | `"prefix"` | Make each `availableModels` model ID entry permit only the version it names *(v2.1.283+)* |
| `deniedModels` | Managed | array of models | unset | Block specific models, even ones `availableModels` permits *(v2.1.283+)* |
| `effortLevel` | Any | `"low"` / `"medium"` / `"high"` / `"xhigh"` | unset | Set a default effort level for models without a saved level of their own |
| `enforceAvailableModels` | Any | bool | `false` | Keep the `/model` Default choice inside your `availableModels` allowlist *(v2.1.175+)* |
| `fallbackModel` | Any | array of models | unset | Name backup models for when the primary is overloaded |
| `fastMode` | Any | bool | unset | Turn fast mode on for sessions where it's available |
| `fastModePerSessionOptIn` | Any | bool | `false` | Require people to turn fast mode on each session |
| `language` | Any | string | unset | Have Claude respond in a language other than English |
| `maxEffortLevel` | Any | `"low"` … `"max"` | unset | Cap the effort level for every model or per model, on every provider *(v2.1.267+)* |
| `model` | Any | alias or model ID | account default | Change the model Claude Code starts with |
| `modelOverrides` | Any | object | unset | Map model IDs to your provider's IDs, such as Bedrock ARNs |
| `modelPicker` | User / Managed | object (`options`, `replaceBuiltInOptions`) | unset | Choose which models the `/model` picker lists, in your own order and with your own labels *(v2.1.242+)* |
| `modelPricing` | Managed | object | unset | Report spend at your organization's contracted rates instead of list price *(v2.1.242+)* |
| `modelSettings` | Any | object | unset | Keep a saved effort level or auto-compact window per model, or cap one model's effort *(v2.1.251+)* |
| `outputStyle` | Any | string | unset | Change Claude's role, tone, and output format with an output style |
| `promptCacheTtl` | Any | `"5m"` / `"1h"` | unset | Choose the prompt cache lifetime for the main conversation *(v2.1.242+)* |
| `showThinkingSummaries` | Any | bool | `false` | See summaries of Claude's thinking instead of a collapsed stub |
| `subagentPromptCacheTtl` | Any | `"5m"` / `"1h"` | unset | Choose the prompt cache lifetime for subagents and other requests outside the main conversation *(v2.1.242+)* |
| `switchModelsOnFlag` | Any | bool | `true` | Switch models automatically or pause when a safety classifier flags a request |
| `ultracode` | Any | bool | unset | Have Claude plan a workflow for each substantive task without being asked |

## Permission settings

What Claude may do without asking. Rules use the `Tool(specifier)` syntax: `Bash(npm run test *)`, `Read(./.env)`, `Edit(src/**)`, `WebFetch(domain:github.com)`, `mcp__github__*`. Evaluation order is **deny → ask → allow**; a deny anywhere wins.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `allowManagedPermissionRulesOnly` | Managed | bool | unset | Make managed settings the only settings source of permission rules |
| `autoMode` | User / Managed | object | unset | Add your own allow and deny rules to the auto mode classifier |
| `autoMode.classifyAllShell` | User / Managed | bool | `false` | Send every shell command through the auto mode classifier, even ones a narrow allow rule matches *(v2.1.193+)* |
| `disableAutoMode` | Any | `"disable"` | unset | Remove auto mode from the permission mode cycle |
| `permissions` | Any | object | unset | Set allow, ask, and deny rules and the starting permission mode |
| `permissions.additionalDirectories` | Any | array | unset | Give Claude file access to directories outside the current one |
| `permissions.allow` | Any | array | unset | Approve listed tool uses without a prompt |
| `permissions.ask` | Any | array | unset | Always prompt before listed tool uses |
| `permissions.blockReadsOutsideWorkingDirectories` | Any | bool | unset | Make the file tools refuse reads outside the working directories in every permission mode *(v2.1.257+)* |
| `permissions.defaultMode` | Any | `"default"` / `"acceptEdits"` / `"plan"` / `"auto"` / `"dontAsk"` / `"bypassPermissions"` / `"manual"` | unset | Set the permission mode new sessions start in |
| `permissions.deny` | Any | array | unset | Block listed tool uses, including reads of files that hold secrets |
| `permissions.disableBypassPermissionsMode` | Any | `"disable"` | unset | Prevent anyone from entering bypassPermissions mode |
| `skipAutoPermissionPrompt` | User / Managed | bool | unset | Skip the one-time notice Claude Code shows when you first enter auto mode yourself rather than through the built-in default |
| `skipDangerousModePermissionPrompt` | User / Local / Managed | bool | unset | Skip the confirmation dialog before bypassPermissions mode |
| `useAutoModeDuringPlan` | User / Local / Managed | bool | `true` | Let the auto mode classifier review shell commands in plan mode; set `false` to get prompts instead |

## Sandbox settings

OS-level isolation for Bash commands and their child processes: Seatbelt on macOS, bubblewrap on Linux and WSL2. Filesystem paths accept prefixes: `/` absolute, `~/` home, `./` or no prefix relative to the settings file.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `sandbox` | Any | object | unset | Isolate Bash commands from your filesystem and network on macOS, Linux, and WSL2 |
| `sandbox.allowAppleEvents` | User / Managed | bool | `false` | Let sandboxed commands send Apple Events on macOS |
| `sandbox.allowUnsandboxedCommands` | Any | bool | `true` | Let Claude retry a blocked command outside the sandbox, or forbid it |
| `sandbox.autoAllowBashIfSandboxed` | Any | bool | `true` | Run sandboxed commands without a permission prompt |
| `sandbox.bwrapPath` | Managed | string | unset | Point the sandbox at a bubblewrap binary outside `PATH` |
| `sandbox.credentials` | Any | object | unset | Hide or mask credential files and variables inside the sandbox |
| `sandbox.credentials.allowPlaintextInject` | User / Managed | bool | `false` | Let masked credentials reach plain HTTP services on trusted test networks |
| `sandbox.credentials.awsPairs` | User / Managed | array | unset | Link custom-named AWS key variables into one credential for re-signing *(v2.1.224+)* |
| `sandbox.credentials.envVars` | Any | array | unset | Unset or mask an environment variable inside the sandbox |
| `sandbox.credentials.files` | Any | array | unset | Block or mask reads of a credential file inside the sandbox |
| `sandbox.credentials.sigv4` | User / Managed | object (`streaming`, `presigned`, `sigv4a`) | unset | Choose whether streaming, presigned, or SigV4A AWS requests fail or pass through *(v2.1.224+)* |
| `sandbox.enabled` | Any | bool | `false` | Turn on Bash sandboxing on macOS, Linux, and WSL2 |
| `sandbox.enableWeakerNestedSandbox` | Any | bool | `false` | Run the Linux sandbox inside an unprivileged container |
| `sandbox.enableWeakerNetworkIsolation` | Any | bool | `false` | Let `gh`, `gcloud`, and `terraform` verify TLS behind a MITM proxy inside the sandbox on macOS |
| `sandbox.excludedCommands` | Any | array | unset | Name commands Claude Code can run outside the sandbox |
| `sandbox.failIfUnavailable` | Any | bool | `false` | Refuse to start when the sandbox can't, instead of running unsandboxed |
| `sandbox.filesystem` | Any | object | unset | Control which paths sandboxed commands can read and write |
| `sandbox.filesystem.allowManagedReadPathsOnly` | Managed | bool | `false` | Stop developers from re-opening read paths your organization blocked |
| `sandbox.filesystem.allowRead` | Any | array | unset | Re-open reading inside a region `denyRead` blocks |
| `sandbox.filesystem.allowWrite` | Any | array | unset | Add paths sandboxed commands can write to |
| `sandbox.filesystem.denyRead` | Any | array | unset | Block sandboxed commands from reading specific paths |
| `sandbox.filesystem.denyWrite` | Any | array | unset | Block sandboxed commands from writing to specific paths |
| `sandbox.filesystem.disabled` | User / Managed | bool | `false` | Turn off filesystem isolation while keeping network isolation *(v2.1.216+)* |
| `sandbox.ignoreViolations` | Any | object | unset | Silence violation reports for paths a command is expected to probe |
| `sandbox.network` | Any | object | unset | Control which hosts, ports, and sockets sandboxed commands reach |
| `sandbox.network.allowAllUnixSockets` | Any | bool | `false` | Let sandboxed commands connect to every Unix socket |
| `sandbox.network.allowedDomains` | Any | array | unset | Pre-allow domains so sandboxed commands don't prompt for them |
| `sandbox.network.allowLocalBinding` | Any | bool | `false` | Let sandboxed commands listen on network ports and connect to localhost on macOS |
| `sandbox.network.allowMachLookup` | Any | array | unset | Let macOS sandboxed tools like the iOS Simulator or Playwright reach their XPC services |
| `sandbox.network.allowManagedDomainsOnly` | Managed | bool | `false` | Lock the network allowlist to managed settings |
| `sandbox.network.allowUnixSockets` | Any | array | unset | List Unix socket paths sandboxed commands can use on macOS |
| `sandbox.network.deniedDomains` | Any | array | unset | Block domains for sandboxed commands, even inside an allowed wildcard |
| `sandbox.network.httpProxyPort` | Any | number | unset | Route sandbox HTTP traffic through your own proxy |
| `sandbox.network.socksProxyPort` | Any | number | unset | Route sandbox SOCKS traffic through your own proxy |
| `sandbox.network.strictAllowlist` | User / Managed | bool | `false` | Deny hosts outside the allowlist instead of prompting *(v2.1.219+)* |
| `sandbox.network.tlsTerminate` | User / Managed | object | unset | Have the sandbox proxy terminate TLS so it can read HTTPS requests |
| `sandbox.ripgrep` | User / Managed | object | unset | Use your own ripgrep binary inside the sandbox |
| `sandbox.socatPath` | Managed | string | unset | Point the sandbox proxy at a `socat` binary outside `PATH` |

## Memory and context

CLAUDE.md loading, auto memory, compaction, checkpoints, and how much tool output reaches the context.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `autoCompactEnabled` | Any | bool | `true` | Turn automatic compaction off or on |
| `autoCompactWindow` | Any | number, 100 000–1 000 000 tokens | unset | Set how full the context gets before Claude Code compacts |
| `autoMemoryDirectory` | Any | string | unset | Store auto memory in a directory you choose |
| `autoMemoryEnabled` | Any | bool | `true` | Turn auto memory off or on |
| `bashOutputMaxChars` | Any | number, 4 000–128 000 | 30 000 | Set how much of a successful command's output Claude receives inline *(v2.1.261+)* |
| `claudeMd` | Managed | string | unset | Inject organization-wide CLAUDE.md instructions from managed settings |
| `claudeMdExcludes` | Any | array | unset | Skip specific CLAUDE.md files when memory loads |
| `env` | Any | object: name → string | unset | Set environment variables for every session and its subprocesses |
| `fileCheckpointingEnabled` | Any | bool | `true` | Turn off or on the file snapshots that `/rewind` restores |
| `plansDirectory` | Any | string | `~/.claude/plans` | Choose where plan mode writes plan files |
| `skillListingBudgetFraction` | Any | number | `0.01` | Reserve more or less context for the skill listing |
| `skillListingMaxDescChars` | Any | number | `1536` | Cap each skill's description length in the skill listing |

## Interface and terminal

How the terminal UI looks and behaves. Most of these are personal: set them with `/config` or in `~/.claude/settings.json`, not in a committed file.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `askUserQuestionTimeout` | User / Managed | `"60s"` / `"5m"` / `"10m"` / `"never"` | `"never"` | Let an unanswered question auto-continue after idle time |
| `autoContinueAtUsageLimit` | User / Managed | bool | `true` | Wait in the open session and continue the task automatically after a claude.ai usage limit resets *(v2.1.234+)* |
| `autoScrollEnabled` | Any | bool | `true` | Follow new output to the bottom in fullscreen rendering |
| `axScreenReader` | Any | bool | unset | Render screen-reader friendly output |
| `bashEditDiffEnabled` | User / Managed | bool | unset | Record the files that changed while a Bash command ran in every permission mode *(v2.1.269+)* |
| `companyAnnouncements` | Any | array | unset | Show your organization's announcements at startup |
| `defaultShell` | Any | `"bash"` / `"powershell"` | `"bash"` (`"powershell"` on Windows without Bash) | Choose whether Bash or PowerShell runs the shell commands you type with the `!` prefix |
| `dialogExpiry` | User / Managed | `"60s"` / `"5m"` / `"10m"` / `"never"` | `"5m"` | Set how long Claude Code waits for Remote Control or an SDK host to answer a forwarded dialog before it cancels the dialog *(v2.1.224+)* |
| `editorMode` | Any | `"normal"` / `"vim"` | `"normal"` | Use vim key bindings in the input prompt |
| `emojiCompletionEnabled` | Any | bool | `true` | Turn off `:shortcode:` emoji suggestions and replacement in the prompt input *(v2.1.217+)* |
| `fileSuggestion` | Any | object (`type`, `command`) | unset | Supply `@` file autocomplete from your own command |
| `footerLinksRegexes` | User / Managed | array | unset | Make issue or review IDs in output into clickable links below the input box |
| `maxProseWidth` | Any | number | unset | Cap how wide the prose in Claude's responses runs in a wide terminal *(v2.1.282+)* |
| `prefersReducedMotion` | Any | bool | `false` | Reduce or turn off spinner, shimmer, and flash animations |
| `promptSuggestionEnabled` | Any | bool | `true` | Hide the grayed-out prompt suggestions in the input box |
| `respectGitignore` | Any | bool | `true` | Keep gitignored files out of the `@` file picker |
| `respondToBashCommands` | Any | bool | `true` | Stop Claude from responding after a `!` shell command runs |
| `showClearContextOnPlanAccept` | Any | bool | `false` | Show a "clear context" option on the plan accept screen |
| `showTurnDuration` | Any | bool | `true` | Hide the "Cooked for" duration after each response |
| `spellcheck` | User / Managed | object | unset | Underline misspelled words in the prompt input with a spell checker you install *(v2.1.235+)* |
| `spinnerTipsEnabled` | Any | bool | `true` | Hide tips in the spinner while Claude works |
| `spinnerTipsOverride` | Any | object | unset | Add your own tips to the spinner rotation, or replace the built-in tips |
| `spinnerVerbs` | Any | object (`verbs`, `mode`: `"append"` / `"replace"`) | unset | Add or replace the verbs shown while a turn runs |
| `statusLine` | Any | object (`type`, `command`, `padding`, `refreshInterval`) | unset | Run your own command to render a status line below the prompt |
| `subagentStatusLine` | Any | object (`type`, `command`) | unset | Rewrite rows in the subagent task display with your own command |
| `syntaxHighlightingDisabled` | Any | bool | `false` | Turn off syntax highlighting in diffs and code blocks |
| `terminalProgressBarEnabled` | Any | bool | `true` | Hide the terminal progress bar in terminals that support it |
| `terminalTitleFromRename` | Any | bool | `true` | Stop `/rename` and `--name` from changing the terminal tab title |
| `theme` | Any | `"auto"` / `"dark"` / `"light"` / `"dark-daltonized"` / `"light-daltonized"` / `"dark-ansi"` / `"light-ansi"` / … | `"dark"` | Pick the interface color theme, built-in or custom |
| `timeFormat` | Any | `"auto"` / `"12-hour"` / `"24-hour"` / `"24-hour-utc"` | `"auto"` | Show the times in the interface on a 12-hour or 24-hour clock, in UTC, or with a strftime pattern *(v2.1.257+)* |
| `timeZone` | Any | string | unset | Show the times in the interface in a time zone other than your system's *(v2.1.257+)* |
| `tui` | Any | `"default"` / `"fullscreen"` | unset | Choose the fullscreen or classic terminal renderer |
| `verbose` | Any | bool | `false` | Show full tool output instead of truncated summaries; `viewMode` takes precedence when both are set |
| `viewMode` | Any | `"default"` / `"verbose"` / `"focus"` | unset | Start every session in default, verbose, or focus view |
| `vimInsertModeRemaps` | User / Managed | object | unset | Map a two-key INSERT-mode sequence such as `jj` to Escape *(v2.1.208+)* |
| `voice` | Any | object (`enabled`, `autoSubmit`, `mode`: `"hold"` / `"tap"`) | unset | Turn on voice dictation and pick hold or tap mode |
| `voiceEnabled` | Any | bool | unset | Turn on voice dictation with the older single-key form |
| `wheelScrollAccelerationEnabled` | Any | bool | `true` | Turn off mouse-wheel acceleration in fullscreen rendering |

## Git and attribution

What Claude Code writes into commits and pull requests, and the built-in git instructions.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `attribution` | Any | object | unset | Customize the attribution Claude Code adds to commits and pull requests |
| `attribution.commit` | Any | string | unset | Change or hide the trailer Claude Code adds to commits |
| `attribution.pr` | Any | string | unset | Change or hide the attribution line in pull request descriptions |
| `attribution.sessionUrl` | Any | bool | `true` | Omit the claude.ai session link from cloud and Remote Control commits |
| `includeGitInstructions` | Any | bool | `true` | Remove the built-in commit and PR instructions from Claude's context |
| `prUrlTemplate` | Any | string | unset | Point PR links at an internal code-review tool instead of github.com |

## Hooks and automation

Lifecycle hooks and workflows. The `hooks` format is shown [in the recipes](#hooks-format).

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `allowedHttpHookUrls` | Any | array | unset | Limit which URLs HTTP hooks can target |
| `allowManagedHooksOnly` | Managed | bool | unset | Run only the hooks your organization deploys *(v2.1.238+)* |
| `disableAllHooks` | Any | bool | unset | Turn off hooks, a custom status line, and a custom `@` file suggestion command at once |
| `disableWorkflows` | Any | bool | `false` | Turn dynamic workflows off for everyone; use `enableWorkflows` for yourself |
| `enableWorkflows` | Any | bool | unset | Turn dynamic workflows on or off against your plan's default |
| `hooks` | Any | object: event → matcher groups | unset | Run your own commands as hooks at points in Claude Code's lifecycle |
| `httpHookAllowedEnvVars` | Any | array | unset | Limit which env vars HTTP hooks can put in headers |
| `workflowKeywordTriggerEnabled` | Any | bool | `true` | Let the word `ultracode` in a prompt start a workflow; set `false` to type it without starting one |
| `workflowSizeGuideline` | Any | `"unrestricted"` / `"small"` / `"medium"` / `"large"` | `"medium"` (`"small"` on Pro) | Set the agent count Claude aims for in dynamic workflows *(v2.1.219+)* |

## Plugins and skills

Which plugins, marketplaces and skills load, and how an organization restricts them.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `allowedChannelPlugins` | Managed | array | unset | Replace the default allowlist of channel plugins that can push messages |
| `appendPlugins` | User / Managed | array | unset | Run your organization's mods after every mod a user installs |
| `blockedMarketplaces` | Managed | array | unset | Block plugin marketplace sources for your organization |
| `channelsEnabled` | Managed | bool | unset | Allow channels for your organization |
| `disableBundledSkills` | Any | bool | unset | Turn off the skills and workflows included with Claude Code |
| `disableCommandPluginSources` | Managed | bool | unset | Block plugins that install by running a marketplace-declared command *(v2.1.229+)* |
| `disableSkillShellExecution` | Any | bool | unset | Stop skills and custom commands from running inline shell |
| `enabledPlugins` | Any | object | unset | Turn individual plugins on or off per scope |
| `extraKnownMarketplaces` | Any | object | unset | Register marketplaces for a repository or an organization *(v2.1.238+)* |
| `pluginConfigs` | User / Managed | object | unset | Store the answers you gave a plugin's configuration dialog |
| `pluginSuggestionMarketplaces` | Managed | array | unset | Choose which marketplaces can surface plugin install suggestions in `/plugin` |
| `pluginTrustMessage` | Managed | string | unset | Add your own text to the plugin trust warning |
| `prependPlugins` | User / Managed | array | unset | Run your organization's mods before every mod a user installs |
| `skillOverrides` | Any | object: skill → `"on"` / `"name-only"` / … | unset | Hide or collapse a skill without editing its SKILL.md |
| `strictKnownMarketplaces` | Managed | array | unset | Allowlist the marketplace sources users can add and install from |
| `strictPluginOnlyCustomization` | Managed | `true` or array of `"skills"` / `"agents"` / `"hooks"` / `"mcp"` | unset | Block skills, agents, hooks, and MCP servers from user and project sources |
| `strictPluginOnlyCustomization.agents` | Managed | `"agents"` | not locked | Lock agents to plugin and managed sources |
| `strictPluginOnlyCustomization.hooks` | Managed | `"hooks"` | not locked | Lock hooks to plugin and managed sources |
| `strictPluginOnlyCustomization.mcp` | Managed | `"mcp"` | not locked | Lock MCP servers to plugin and managed sources |
| `strictPluginOnlyCustomization.skills` | Managed | `"skills"` | not locked | Lock skills to plugin and managed sources |
| `syncClaudeAiPlugins` | User / Local / Managed | bool | unset | Stop loading the plugins enabled on your claude.ai account and stop downloading new ones *(v2.1.273+)* |
| `syncClaudeAiSkills` | User / Local / Managed | bool | unset | Stop loading the skills enabled on your claude.ai account and stop downloading new ones |

## MCP

Which MCP servers from `.mcp.json`, claude.ai connectors and managed configuration are allowed to run.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `allowAllClaudeAiMcps` | Managed | bool | `false` | Load the claude.ai connectors Claude Code fetches itself alongside a deployed `managed-mcp.json` |
| `allowClaudeInChromeWithManagedMcp` | Managed | bool | `false` | Let the built-in Claude in Chrome server run alongside a deployed `managed-mcp.json` *(v2.1.282+)* |
| `allowedMcpServers` | Any | array | unset | Allowlist which MCP servers users can add |
| `allowManagedMcpServersOnly` | Managed | bool | `false` | Make the managed MCP allowlist the only one that applies |
| `deniedMcpServers` | Any | array | unset | Block specific MCP servers by URL, command, or name |
| `disableClaudeAiConnectors` | Any | bool | `false` | Turn off claude.ai connectors so Claude Code doesn't fetch them |
| `disabledMcpjsonServers` | Any | array | unset | Reject specific servers from a project's `.mcp.json` |
| `enableAllProjectMcpServers` | Any | bool | unset | Approve every server in project `.mcp.json` files without a prompt |
| `enabledMcpjsonServers` | Any | array | unset | Approve specific servers from a project's `.mcp.json` |
| `managedMcpServers` | Managed | object | unset | Provide remote MCP servers to every user alongside the ones they add *(v2.1.259+)* |

## Agents, sessions, and worktrees

The default agent, agent teams, background sessions and git worktree isolation.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `agent` | Any | string | unset | Start every session as a named subagent with its prompt, tools, and model |
| `crossSessionInbound` | Any | `"accept"` / `"hold"` / `"refuse"` | unset | Choose whether Claude Code delivers messages from your other sessions, shows a notice without delivering them, or refuses them *(v2.1.224+)* |
| `disableAgentView` | Any | bool | unset | Turn off background agents and agent view |
| `isolatePeerMachines` | Any | bool | unset | Ask you before Claude messages one of your sessions on another machine |
| `processWrapper` | User / Managed | string | unset | Run Claude Code's background processes through a corporate launcher on macOS and Linux *(v2.1.210+)* |
| `teammateMode` | Any | `"in-process"` / `"auto"` / `"tmux"` / `"iterm2"` | `"in-process"` | Choose how agent team teammates display |
| `worktree` | Any | object | unset | Configure how Claude Code creates git worktrees |
| `worktree.baseRef` | Any | `"fresh"` / `"head"` | `"fresh"` | Branch new worktrees from the remote default branch or your local HEAD |
| `worktree.bgIsolation` | Any | `"worktree"` / `"none"` | `"worktree"` | Let background sessions edit the working copy without a worktree |
| `worktree.sparsePaths` | Any | array | unset | Check out only the directories you need in each worktree |
| `worktree.symlinkDirectories` | Any | array | unset | Symlink large directories into each worktree instead of duplicating them |

## Remote, desktop, and notifications

Remote Control, the desktop app, SSH hosts, push and terminal notifications.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `agentPushNotifEnabled` | Any | bool | `false` | Let Claude send a push notification to your phone when it decides to |
| `awaySummaryEnabled` | Any | bool | unset | Turn off the session recap shown when you come back to the terminal |
| `disableDeepLinkRegistration` | Any | `"disable"` | unset | Stop Claude Code from registering the `claude-cli://` handler |
| `disableDesktopLocalSessions` | Managed | bool | unset | Turn off Desktop Code sessions that run on the device, leaving SSH to other hosts and cloud |
| `disableRemoteControl` | Any | bool | `false` | Turn off Remote Control everywhere it can start |
| `enableArtifact` | Any | bool | unset | Turn the Artifact tool off with a `false` in any file; no file can turn it back on *(v2.1.196+)* |
| `inputNeededNotifEnabled` | Any | bool | `false` | Get a push notification when Claude is waiting on you |
| `preferredNotifChannel` | Any | `"auto"` / `"terminal_bell"` / `"iterm2"` / `"iterm2_with_bell"` / `"kitty"` / `"ghostty"` / `"notifications_disabled"` | `"auto"` | Choose a terminal bell or desktop notification for task completion |
| `remote.defaultEnvironmentId` | Any | string | unset | Pick the default cloud environment for `claude --cloud`; a self-hosted `ccpool_` ID is read only from user and managed settings and `--settings` |
| `remoteControlAtStartup` | Any | bool | unset | Connect Remote Control automatically when a session starts |
| `sshConfigs` | User / Managed | array | unset | Add SSH connections to the Desktop environment dropdown |
| `sshHostAllowlist` | Managed | array | unset | Limit which hosts Desktop SSH sessions can reach |

## Authentication and providers

Credential helpers, login restrictions and API providers (Anthropic, Bedrock, Vertex AI, Foundry, gateways).

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `allowedProviders` | Managed | array of `"anthropic"` / `"bedrock"` / `"vertex"` / `"foundry"` / `"anthropicAws"` / `"mantle"` / `"customEndpoint"` / … | unset | Limit which API providers a machine may use *(v2.1.285+)* |
| `apiKeyHelper` | Any | string | unset | Generate the API credential with your own command *(v2.1.246+)* |
| `awsAuthRefresh` | Any | string | unset | Refresh expired Bedrock credentials in `.aws` with your own command |
| `awsCredentialExport` | Any | string | unset | Supply Bedrock credentials as JSON from your own command |
| `forceLoginGatewayUrl` | Managed | string | unset | Set the gateway URL the login screen connects to |
| `forceLoginMethod` | Any | `"claudeai"` / `"console"` / `"gateway"` | unset | Restrict login to claude.ai, Claude Console, or a cloud gateway |
| `forceLoginOrgUUID` | Any | array | unset | Pin claude.ai logins to your organization; only a managed source enforces it |
| `gatewayInternalNetworks` | Managed | array | unset | Let `/login` reach a cloud gateway on public IPv4 space your organization uses internally *(v2.1.268+)* |
| `gcpAuthRefresh` | Any | string | unset | Refresh Google Cloud credentials with your own command |
| `otelHeadersHelper` | Any | string | unset | Generate rotating OpenTelemetry headers with your own command |

## Updates and versioning

Release channel and version pins.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `autoUpdatesChannel` | Any | `"latest"` / `"stable"` | `"latest"` | Follow the stable release channel instead of latest |
| `minimumVersion` | Any | number | unset | Keep auto-updates from installing anything below a version |
| `requiredMaximumVersion` | Managed | number | unset | Refuse to start on a version newer than your organization allows *(v2.1.163+)* |
| `requiredMinimumVersion` | Managed | number | unset | Refuse to start on a version older than your organization requires *(v2.1.163+)* |

## Tools

Restrictions for desktop-only tools: the Browser pane and mobile simulators.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `browserExternalPageTools` | Managed | `"disabled"` | unset | Keep Claude's tools off external pages in the desktop Browser pane |
| `disableBrowserExternalNavigation` | Managed | bool | unset | Limit the desktop Browser pane to localhost for people and Claude |
| `disableMobileSimulatorTools` | Managed | bool | unset | Block Claude's tools in the desktop iOS Simulator pane |

## Privacy and telemetry

Transcript retention, feedback prompts and WebFetch preflight checks.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `cleanupPeriodDays` | Any | number | `30` | Choose how many days Claude Code keeps transcripts before deleting them |
| `desktopSessionCleanupPeriodDays` | User / Managed | number | `0` | Set an age limit in days for Claude Desktop and Cowork transcripts *(v2.1.248+)* |
| `feedbackDrafts` | User / Managed | `"notify"` / `"quiet"` / `"off"` | `"notify"` | Control whether Claude queues feedback drafts for you to review |
| `feedbackSurveyRate` | Any | number | unset | Change how often the session quality survey appears |
| `skipWebFetchPreflight` | Any | bool | unset | Skip the WebFetch hostname check when Anthropic is unreachable |

## Enterprise and managed settings

How managed sources combine and refresh, and the external policy helper.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `disableSideloadFlags` | Managed | bool | `false` | Reject the CLI flags that sideload plugins, subagents, and MCP servers *(v2.1.193+)* |
| `forceRemoteSettingsRefresh` | Managed | bool | `false` | Block startup until server-managed settings are freshly fetched |
| `managedSourcesBehavior` | Managed | `"first-wins"` / `"merge"` | `"first-wins"` | Compose every managed source you deploy instead of using the highest-priority one alone *(v2.1.242+)* |
| `parentSettingsBehavior` | Managed | `"first-wins"` / `"merge"` | `"first-wins"` | Apply or drop restrictions an SDK or IDE host passes when you deploy managed settings |
| `policyHelper` | Managed | object | unset | Run an executable that computes managed settings at startup |
| `policyHelper.path` | Managed | string | none | Name the helper executable Claude Code runs |
| `policyHelper.refreshIntervalMs` | Managed | number | unset | Re-run the helper in the background on an interval |
| `policyHelper.timeoutMs` | Managed | number | `10000` | Set how long Claude Code waits for the helper |
| `wslInheritsWindowsSettings` | Managed | bool | `false` | Have WSL read managed settings from the Windows policy chain *(v2.1.282+)* |

## Global config settings

These keys live in `~/.claude.json`, not in `settings.json`; Claude Code ignores them anywhere else. `/config` writes most of them for you.

| Key | Scope | Type | Default | What it does |
|---|---|---|---|---|
| `autoConnectIde` | `~/.claude.json` | bool | `false` | Connect to a running VS Code or JetBrains IDE automatically from an external terminal |
| `autoInstallIdeExtension` | `~/.claude.json` | bool | `true` | Turn off automatic install of the IDE extension from a VS Code terminal |
| `claudeInChromeDefaultEnabled` | `~/.claude.json` | bool | unset | Turn on Chrome integration when a session starts, in the interactive CLI and the VS Code extension |
| `copyFullResponse` | `~/.claude.json` | bool | `false` | Make `/copy` copy the full response without showing the code block picker |
| `copyOnSelect` | `~/.claude.json` | bool | `true` | Turn off automatic copying of text you select with the mouse in fullscreen rendering and agent view |
| `defaultToAgentsView` | `~/.claude.json` | bool | `false` | Open agent view instead of a new conversation when you run `claude` with no arguments |
| `diffTool` | `~/.claude.json` | `"auto"` / `"terminal"` | `"auto"` | Choose whether Claude's proposed file changes open in the VS Code or JetBrains diff viewer or stay in the terminal |
| `externalEditorContext` | `~/.claude.json` | bool | `false` | Show Claude's last response as comments when you press Ctrl+G to edit |
| `leftArrowOpensAgents` | `~/.claude.json` | bool | `true` | Turn off the `←` shortcut that backgrounds the session and opens agent view |
| `prStatusFooterEnabled` | `~/.claude.json` | bool | `true` | Turn off the prompt footer's PR review status badge and the pull request check behind it |

## Deprecated and Removed Keys

| Key | Status | Use instead |
|---|---|---|
| `disableArtifact` | Deprecated | `enableArtifact: false` |
| `includeCoAuthoredBy` | Deprecated | `attribution` |
| `keybindingFlavor` | Deprecated | — (readline conventions always apply) |
| `permissionExplainerEnabled` | Removed in v2.1.257 | — |
| `taskOutputMaxChars` | Removed in v2.1.277 | — |
| `teammateDefaultModel` | Removed in v2.1.234 | the teammate model rules in agent teams |

## Recipes

### Team Project (`.claude/settings.json`)

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Bash(uv run pytest *)", "Bash(uv run ruff *)", "Bash(git diff *)"],
    "ask": ["Bash(git push *)"],
    "deny": ["Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)", "Bash(curl *)"]
  },
  "env": { "PYTHONDONTWRITEBYTECODE": "1" },
  "attribution": { "commit": "Co-Authored-By: Claude <noreply@anthropic.com>", "pr": "" },
  "enabledPlugins": { "formatter@acme-tools": true },
  "cleanupPeriodDays": 14
}
```

### Hooks Format

Three levels: **event** → **matcher group** → **handlers**. The handler gets the event as JSON on stdin; exit code `2` blocks the action and shows stderr to Claude, `0` lets it proceed, any other code is a non-blocking error.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "jq -r '.tool_input.file_path' | xargs uv run ruff format" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-dangerous.sh", "timeout": 10 }
        ]
      }
    ]
  }
}
```

More events, handler types and exit-code rules: [Claude Code Hooks & Agent Personas](08-claude-code-hooks-agents.md).

### Sandboxed Unattended Runs

```json
{
  "permissions": { "defaultMode": "acceptEdits" },
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["docker *"],
    "filesystem": { "denyRead": ["~/.aws/credentials", "~/.ssh"] },
    "network": { "allowedDomains": ["github.com", "*.pypi.org", "files.pythonhosted.org"] }
  }
}
```

### Organization Policy (`managed-settings.json`)

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable",
    "deny": ["Read(**/.env)", "Bash(curl *)"]
  },
  "allowManagedPermissionRulesOnly": true,
  "allowManagedHooksOnly": true,
  "availableModels": ["opus", "sonnet"],
  "strictKnownMarketplaces": [{ "source": "github", "repo": "acme-corp/approved-plugins" }],
  "cleanupPeriodDays": 30,
  "requiredMinimumVersion": "2.1.250"
}
```

### Personal Preferences (`~/.claude/settings.json`)

```json
{
  "model": "opus",
  "effortLevel": "high",
  "theme": "auto",
  "editorMode": "vim",
  "language": "ukrainian",
  "spinnerTipsEnabled": false,
  "statusLine": { "type": "command", "command": "~/.claude/statusline.sh" }
}
```

---
## See also
- [Claude Code Best Practices](07-claude-code-best-practices.md)
- [Claude Code Hooks & Agent Personas](08-claude-code-hooks-agents.md)
- [Claude Code Advanced Configuration](10-claude-code-advanced-config.md)
- [Claude Code — Commands Reference](19-claude-code-commands-reference.md)
- [Official settings reference](https://code.claude.com/docs/en/settings-reference)
- [Claude Code — What's New in 2026](21-claude-code-whats-new-2026.md)
