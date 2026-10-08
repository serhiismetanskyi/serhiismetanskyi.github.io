---
date: 2026-10-08
tags:
  - ai-agents
  - coding-agents
  - claude-code
---

# Claude Code — Mods, Artifacts, Channels & Remote Sessions

Beyond the terminal conversation, Claude Code has features that change its interface, publish its output as web pages, accept events from outside, and let sessions run elsewhere than your laptop. This page covers each one and when to reach for it.

| Feature | What it gives you | Start with |
|---|---|---|
| [Mods](#mods) | Plugins that run *inside* Claude Code: panes, commands, tool-call guards | `/plugin enable cc-plugin-you-should-know@builtin` |
| [Artifacts](#artifacts) | Live, private web pages published from the session | "Publish this as an artifact"; `/artifacts` |
| [Channels](#channels) | Events from Telegram, Discord, iMessage or CI pushed into a running session | `--channels`, plugin `fakechat` for a demo |
| [Remote Control](#remote-control-and-cloud-sessions) | Continue a local session from the phone or claude.ai | `claude remote-control`, `/remote-control` |
| [Scheduling](#scheduling) | Repeat a prompt in a session, or run it on a cron in the cloud | `/loop 10m check the deploy`, `/schedule` |
| [Deep links](#deep-links) | A URL that opens Claude Code in the right repo with a prompt | `claude-cli://…` |
| [Self-hosted runner](#self-hosted-runner) | Run web, mobile and desktop sessions on your own machines | `claude self-hosted-runner` |
| [Claude in Chrome](#claude-in-chrome-and-computer-use) | Browser automation with your own logins | `/chrome` |

## Mods

A **mod** is a [plugin](10-claude-code-advanced-config.md#plugins) of JavaScript or TypeScript event handlers. Claude Code calls a handler when something happens — a tool call, a submitted prompt, a part of the interface being drawn — and the handler can watch the event, change it or take it over. Settings hooks, skills, status lines and MCP servers work from outside Claude Code; a mod runs inside it, so it can do things they cannot:

- **Draw an interface you can use**: a pane beside the transcript or a band above the prompt, with tabs, buttons and text fields.
- **Redraw Claude Code's own interface**: replace or restyle a tool call's row, the spinner or the dialog Claude asks questions in.
- **Step into a tool call or request**: hold a call while you ask the user a question, answer it without running the tool, or send one request to a different model.
- **Run your code on a command**: a `/command` that runs a function at once, with no Claude turn, even while Claude is working.
- **Share data between hooks**: hooks of one mod share the variables in its file, so one can count tool calls while another shows the count beside the spinner.

Mods work in the CLI and in the Code tab of the desktop app; their behaviour in the VS Code extension, in `claude -p` and in cloud sessions differs. Some built-in features are mods — `/diff`, for example.

```bash
/plugin install token-chart@your-org           # inside a session
claude plugin install token-chart@your-org     # from the shell
claude plugin install token-chart --marketplace your-org/plugins   # add the marketplace first, then install
claude plugin validate ./my-mod --json         # lists gating hooks (hooks that can block)
```

- **Trust**: a mod runs code inside your session. List what a mod does before installing it, and prefer mods from a marketplace your organization approves.
- **Choose by need**: if a settings [hook](08-claude-code-hooks-agents.md), a skill or an MCP server already does the job, use that; write a mod only for interface changes or deep control of tool calls.
- **Organizations** can stop user-installed mods, allow only their own, and enforce policy with a mod of their own (`appendPlugins`, `prependPlugins`, `strictPluginOnlyCustomization`).
- The built-in `plugin-authoring` skill helps write one; `claude plugin test` runs a mod against a mock session, and `claude plugin eval` runs a plugin's eval suite and writes a JSON and HTML report.

## Artifacts

An **artifact** is a live, interactive web page that Claude Code publishes from your session to a private URL on claude.ai. You open it in a browser, and it updates in place as the session continues. Use one when terminal text is the wrong medium:

- walk a reviewer through a pull request with annotated diffs;
- render a dashboard from data the session already pulled;
- lay out several design or implementation options side by side;
- keep an investigation timeline that fills in while a long task runs;
- send a teammate a link instead of pasting output into Slack.

How it works:

- Ask Claude to publish one; `/artifacts` lists the session's artifacts (a `⧉ name` pill in the footer opens it). Claude updates the same page when you ask for changes.
- An artifact is private until you share it from the page header — with your organization, or through a public link. You can let someone edit with you and collect comments; Claude can reply to comments on its own.
- A page can pull **live data through MCP connectors** each time someone opens it, so a status board does not go stale.
- It is one self-contained page with no backend: it cannot serve several routes. For a hosted internal tool with a backend, deploy your own app.
- Pages load libraries only from approved CDNs, pinned to exact versions; a **Slides**, **Design** or **Docs** template gives a ready-made structure.
- Scheduled and *Run now* routines publish private artifacts without asking.
- Organizations can turn artifacts off (`enableArtifact: false`); a `false` from any settings scope wins even against managed settings.

## Channels

A **channel** is an MCP server that pushes events into your *running* session, so Claude can react to things that happen while you are away from the terminal: CI results, alerts, chat messages. Channels can be two-way — Claude reads the event and replies through the same channel, like a chat bridge. Telegram, Discord and iMessage are supported in the research preview; each is a plugin that needs [Bun](https://bun.sh) and your own credentials.

```bash
claude --channels plugin:fakechat@claude-plugins-official     # local demo UI on localhost
```

- You see the inbound message in the terminal, but not the reply text: the terminal shows the tool call and a confirmation, and the reply appears on the other platform.
- Events arrive only while the session is open; for an always-on setup run Claude in a background process or a persistent terminal.
- Organizations enable channels with `channelsEnabled` and restrict which channel plugins may run with `allowedChannelPlugins`.
- Unlike integrations that start a fresh cloud session, the event lands in the session you already have open, with its context.

## Remote Control and Cloud Sessions

| Feature | What it does |
|---|---|
| **Remote Control** | Continue a local session from your phone or claude.ai/code. Start it with `claude remote-control`, `claude --remote-control` or `/remote-control`. A footer pill shows its state, and a session started this way can be forked from the Claude app into a background session on your computer |
| **Cloud sessions** | Claude Code runs on Anthropic's infrastructure; start with `--cloud` or from claude.ai/code, move a session to your terminal with `--teleport` |
| **Projects** | One conversation that starts and tracks cloud threads (see [Parallel Agents](21-claude-code-parallel-agents.md#projects-cloud)) |
| **Routines** | A prompt that runs in the cloud on a schedule, with no machine of yours involved |
| **Mobile** | Start, monitor and steer sessions from the Claude app; Claude can send a push notification when it needs you (`agentPushNotifEnabled`) |

Remote Control and cloud features need a claude.ai login: they are disabled when an `ANTHROPIC_API_KEY`, `apiKeyHelper` or `ANTHROPIC_AUTH_TOKEN` is the only credential, or when `ANTHROPIC_BASE_URL` points to a non-Anthropic endpoint. Auto-start of Remote Control cannot be turned on from a repository's own settings; enable it at user scope with `/config`.

## Scheduling

| Mechanism | Runs | Needs your machine | Use it for |
|---|---|---|---|
| **`/loop`** | Inside the open session, on an interval or self-paced | Yes | Quick polling during a session: `/loop 5m check whether the deploy finished` |
| **Desktop tasks** | In the desktop app on a schedule | Yes | Work that needs local files and tools |
| **Routines** (`/schedule`) | In the cloud on a cron | No | Reliable recurring work: a nightly dependency check |

Session tasks expire after seven days and are restored when you resume with `--resume` or `--continue`. A background session waiting on a `/loop` wakeup is kept running through updates and low memory. `/usage` has a *Loops* breakdown.

## Deep Links

A `claude-cli://` URL opens a new terminal window with Claude Code, optionally in a given working directory and with a pre-filled prompt. Put them in runbooks, alerts and dashboards: one click lands in the right repo with the right question. `disableDeepLinkRegistration: "disable"` stops Claude Code from registering the handler.

## Self-Hosted Runner

`claude self-hosted-runner` (Team and Enterprise) runs Claude Code web, mobile and desktop sessions on **your** machines or containers instead of Anthropic's cloud, so code and credentials stay inside your network. Useful flags control session shutdown and proxy authorization (`--defer-shutdown-max-min`, `--proxy-authorization-command`, `--kill-session-after-min`). System prompts reach the runner as private files, so wrapper scripts must use `--system-prompt-file` and `--append-system-prompt-file`.

## Claude in Chrome and Computer Use

- **Claude in Chrome** (`/chrome`, `--chrome`) drives your real Chrome with your own sign-ins: testing a page, filling a form, reading a dashboard. Project settings cannot switch it on; organizations control it centrally (`allowClaudeInChromeWithManagedMcp` lets it run next to an exclusive managed MCP configuration).
- **Computer use** lets Claude open apps, click, type and see your screen on macOS — for testing native apps and automating tools that have no API. It needs explicit permission, including Finder access.
- The desktop app's **Browser pane** is controlled by `browserExternalPageTools` and `disableBrowserExternalNavigation` for organizations.

---
## See also
- [Claude Code — Parallel Agents](21-claude-code-parallel-agents.md)
- [Claude Code Advanced Configuration](10-claude-code-advanced-config.md)
- [Claude Code Hooks & Agent Personas](08-claude-code-hooks-agents.md)
- [Model Context Protocol (MCP)](11-mcp-protocol.md)
- [Claude Code — Settings Reference](20-claude-code-settings-reference.md)
