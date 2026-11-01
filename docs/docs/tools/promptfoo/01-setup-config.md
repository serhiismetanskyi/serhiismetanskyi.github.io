---
date: 2026-10-25 12:00:00
tags:
  - tools
  - llm
  - evaluation
  - promptfoo
  - red-teaming
  - testing
---

# promptfoo — Setup & Config

Installing the CLI, the shape of `promptfooconfig.yaml`, how prompts are written and templated, where API keys come from, what the cache does and which flags matter when running `promptfoo eval`.

## Create a Project

```bash
mkdir ticket-evals && cd ticket-evals
npx promptfoo@latest init --no-interactive      # writes promptfooconfig.yaml + README.md
npx promptfoo@latest init --example getting-started   # or download an official example
npx promptfoo@latest init                       # interactive wizard
```

`promptfoo eval` reads `promptfooconfig.yaml` from the current directory. `.yaml`, `.yml`, `.json` and `.js` configs are supported; pass another file with `-c path/to/config.yaml`. Several `-c` files (or a glob) are merged into one eval.

!!! tip "Editor validation"
    First line `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json` gives completion and validation in editors that use the YAML language server. `promptfoo validate config -c promptfooconfig.yaml` checks a file from the CLI without calling any provider.

## Config Anatomy

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Support bot regression suite
tags:
  suite: smoke                     # eval tags, shown in the UI and exports

prompts:                           # what is sent
  - file://prompts/support.txt
  - file://prompts/support_chat.json

providers:                         # who answers (alias: targets)
  - id: openai:chat:gpt-6-luna
    label: luna
    config:
      temperature: 0

defaultTest:                       # merged into every test
  vars:
    company: Acme
  options:
    provider: openai:gpt-6-sol     # grader for model-graded assertions
  assert:
    - type: latency
      threshold: 5000

tests: file://tests/cases.csv      # or an inline list

evaluateOptions:
  maxConcurrency: 4
  repeat: 1
  cache: true

sharing: false                     # never upload automatically
outputPath: out/results.json       # same as -o
```

| Key | Purpose |
|-----|---------|
| `description`, `tags`, `metadata` | Labels for the eval; `tags` can also be set per run with `--tag key=value` |
| `prompts` | String, list, `file://` paths, globs, `{id, label, raw}` objects, or a map of label to text |
| `providers` / `targets` | Exactly one of the two is required; same syntax |
| `defaultTest` | Partial test case (`vars`, `assert`, `options`, `threshold`, `metadata`) applied to all tests; may be `file://defaults.yaml` |
| `tests` | Inline list, `file://` path or glob (YAML, JSON, JSONL, CSV, XLSX, JS / Python generator), Google Sheets URL, `huggingface://` dataset |
| `scenarios` | Data sets crossed with test sets (see [04](./04-rag-agents-multiturn.md)) |
| `evaluateOptions` | `maxConcurrency` (default 4), `repeat`, `delay` (ms), `cache`, `showProgressBar`, `timeoutMs` per call, `maxEvalTimeMs` for the whole run |
| `commandLineOptions` | Defaults for CLI flags (`maxConcurrency`, `grader`, `envPath`, `filterPattern`, `table`, ...) |
| `derivedMetrics` | Formulas over named metrics (see [03](./03-test-cases-assertions.md)) |
| `outputPath` | One path or a list of paths: `.json`, `.csv`, `.html`, `.yaml`, `.jsonl`, `.txt`, `.xml`, `.junit.xml` |
| `sharing` | `false`, `true`, or `{apiBaseUrl, appBaseUrl}` for a self-hosted server |
| `env` | Environment values for this run; they override the process environment |
| `nunjucksFilters` | Map of filter name to a JS file |
| `extensions` | `file://hooks.js:fn` with `beforeAll`, `afterAll`, `beforeEach`, `afterEach` hooks |
| `basePath` | Directory for relative `file://` paths (defaults to the config directory) |
| `tracing` | OpenTelemetry receiver for trace-based assertions |
| `redteam` | Red team section (see [05](./05-redteam-ci.md)) |
| `writeLatestResults` | Write results to the local store so `promptfoo view` shows them (library mode) |

Providers, tests and defaults can live in separate files:

```yaml
providers:
  - file://providers/gateway.yaml
tests:
  - file://tests/*.yaml
  - vars: { question: Inline test next to file-based ones }
defaultTest: file://tests/defaults.yaml
```

## Prompts

| Form | Example | Notes |
|------|---------|-------|
| Inline | `'Translate to {{language}}: {{text}}'` | Nunjucks `{{ }}`, filters and `{% if %}` work |
| Text file | `file://prompts/support.txt` | Several prompts in one `.txt`, separated by a line `---` (`PROMPTFOO_PROMPT_SEPARATOR` changes it) |
| Markdown / Jinja | `file://prompt.md`, `file://prompt.j2` | Same templating |
| CSV | `file://prompts.csv` | Columns `prompt`, `label`; one prompt per row |
| Glob | `file://prompts/*.txt`, `file://prompts/**/*.json` | Every match becomes a prompt |
| Chat JSON / YAML | `file://prompts/chat.json` | OpenAI-style `[{role, content}]` array |
| JS function | `file://prompts/build.js` | `module.exports = async ({vars, provider}) => ...` |
| Python function | `file://prompts/build.py:build_prompt` | `def build_prompt(context): ... context['vars']` |
| Executable | `exec:./make_prompt.sh` | Gets the test context as JSON in `argv[1]`, prints the prompt |
| Labelled | `{id: file://p.txt, label: v2}` | Labels name the column and are used by `--filter-prompts` |

```json
[
  {"role": "system", "content": "You are a support bot for {{company}}. Be brief."},
  {"role": "user", "content": "{{question}}"}
]
```

```javascript
// prompts/build.js — return a string, a messages array or {prompt, config}
module.exports = async function ({ vars, provider }) {
  return [
    { role: 'system', content: `Support bot for ${vars.company}.` },
    { role: 'user', content: vars.question },
  ];
};
```

```python
# prompts/build.py
import json

def build_prompt(context):
    vars = context["vars"]
    return json.dumps([
        {"role": "system", "content": f"Support bot for {vars['company']}."},
        {"role": "user", "content": vars["question"]},
    ])
```

Templating rules worth knowing:

- Values in `vars` can be strings, numbers, objects or arrays. Arrays are expanded into the cross product of tests unless `options.disableVarExpansion: true`.
- In a prompt that is valid JSON, variables are escaped automatically. In a prompt that is not valid JSON (loops, `{% if %}`), use `{{ value | dump }}`.
- `{{ env.NAME }}` reads environment variables when the config is loaded.
- `nunjucksFilters: {shout: ./filters/shout.js}` registers `{{ text | shout }}`.
- With no `prompts`, `{{prompt}}` is used as a passthrough.
- Prompt files can be pulled from `langfuse://my-prompt@production`, `portkey://...` and `helicone://...`.

## Environment Variables and API Keys

| Variable | Used by |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI provider and the default grader |
| `OPENAI_API_BASE_URL` / `OPENAI_BASE_URL` / `OPENAI_API_HOST` | Point OpenAI providers at a gateway |
| `ANTHROPIC_API_KEY` | Anthropic provider |
| `AZURE_API_KEY`, `AZURE_API_HOST`, `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` | Azure OpenAI |
| `GOOGLE_API_KEY` | Google AI Studio (Gemini) |
| AWS SDK credential chain (`AWS_ACCESS_KEY_ID`, `AWS_PROFILE`, instance roles) | Bedrock |
| `OLLAMA_BASE_URL` | Ollama (default `http://localhost:11434`) |
| `HF_TOKEN` | Hugging Face datasets and models |
| `PROMPTFOO_PYTHON` | Python executable for Python providers, prompts and assertions |

Without `--env-file`, promptfoo loads `.env` from the current directory; values already set in the shell win. `--env-file .env --env-file .env.ci` (or comma-separated) loads several files, later ones override. `DOTENV_PATH` names another default file and `DOTENV_OVERRIDE=true` lets the file beat the shell. Per-provider `apiKey`, `apiKeyEnvar` and `apiBaseUrl` live under `providers[].config`.

!!! warning "Keep secrets out of the config"
    `env:` in the config and `{{ env.KEY }}` templates resolve into the eval config, which ends up in exports. Read keys from the process environment, `.env` (ignored by git) or CI secrets.

## Caching

Successful provider responses are cached on disk (`~/.promptfoo/cache`, 14 days). Errors and empty responses are not cached. The key includes provider, rendered prompt, provider config and context variables, so changing any of them is a miss.

| Control | Effect |
|---------|--------|
| `--no-cache` or `evaluateOptions.cache: false` | No cache reads or writes |
| `promptfoo cache clear` | Delete cached responses |
| `PROMPTFOO_CACHE_PATH`, `PROMPTFOO_CACHE_TTL` (seconds), `PROMPTFOO_CACHE_TYPE` (`disk` / `memory`), `PROMPTFOO_CACHE_ENABLED` | Location, lifetime, backend |
| `PROMPTFOO_RETRY_5XX=true` | Retry HTTP 500 responses |

Use `--no-cache` for `latency` and `cost` assertions, for fresh model behaviour, and with `--repeat` (each repeat index has its own cache namespace).

## Running Evals

```bash
promptfoo eval                                    # config from the current directory
promptfoo eval -c evals/triage.yaml -o results.json -o report.html
promptfoo eval --var company=Globex --repeat 3 --no-cache
promptfoo eval -p 'Q: {{question}}' -r openai:gpt-6-luna -t questions.csv    # no config file
promptfoo eval --assertions asserts.yaml --model-outputs outputs.json        # score saved outputs
```

| Flag | Purpose |
|------|---------|
| `-c, --config <paths...>` | Config file(s) |
| `-p, --prompts`, `-r, --providers`, `-t, --tests` | Override or replace config sections |
| `--var key=value` | Set or override a test variable |
| `-o, --output <paths...>` | `json`, `csv`, `html`, `yaml`, `jsonl`, `txt`, `xml`, `junit.xml` (by extension) |
| `-j, --max-concurrency <n>` | Parallel calls (default 4) |
| `--repeat <n>` | Run each test `n` times |
| `--delay <ms>` | Wait between calls |
| `--no-cache` | Skip the cache |
| `--grader <provider>` | Grader for model-graded assertions |
| `-n, --filter-first-n`, `--filter-sample <n>` (+ `--filter-sample-seed`), `--filter-range 0:50` | Run a subset |
| `--filter-pattern <regex>` | Tests whose `description` matches |
| `--filter-metadata key=value` | Tests by metadata (repeat for AND, commas for OR) |
| `--filter-prompts`, `--filter-providers` | Regex on prompt / provider id or label |
| `--filter-failing <json or evalId>`, `--filter-errors-only` | Re-run failures or errors of an earlier run |
| `--retry-errors`, `--resume [evalId]` | Retry `ERROR` rows, continue an interrupted run |
| `--tag key=value` | Run tags (CI run id, git sha) |
| `--no-table`, `--no-progress-bar`, `--table-cell-max-length` | Quiet logs for CI |
| `--no-write` | Do not store the run locally |
| `--share` / `--no-share` | Upload or never upload |
| `-w, --watch` | Re-run when files change |
| `--env-file <path>` | Extra `.env` files |
| `--safe-mode` | Reject inline JavaScript assertions and transforms (not a sandbox) |

In `eval`, `-v` means `--vars` (CSV path); for debug output use `--verbose` or `LOG_LEVEL=debug`.

**Exit codes:** `0` all tests passed, `100` at least one failed or the pass rate is below `PROMPTFOO_PASS_RATE_THRESHOLD` (percent, default 100), `1` any other error. `PROMPTFOO_FAILED_TEST_EXIT_CODE` replaces `100`.

## Web UI, Data and Telemetry

- `promptfoo view` serves the results on port 15500 (`-p` changes it, `-y` skips the open-browser prompt). The UI filters failures, shows full prompts, compares evals and exports CSV / JSON / YAML.
- Every eval is stored in a local SQLite database, `~/.promptfoo/promptfoo.db`, next to `cache/` and `logs/`. `PROMPTFOO_CONFIG_DIR` relocates the directory (then `promptfoo view <dir>`); `PROMPTFOO_LOG_DIR` relocates logs. `promptfoo list evals`, `show`, `export eval <id>`, `import` and `delete` manage stored runs.
- Telemetry (command names, assertion types, package version, CI flag; no prompts, outputs or keys) is on by default. Disable with `PROMPTFOO_DISABLE_TELEMETRY=1`; disable the npm update check with `PROMPTFOO_DISABLE_UPDATE=1`.
- Results go to a shared URL only through `--share`, `sharing: true` / `sharing: {apiBaseUrl, appBaseUrl}` or `promptfoo share`. `--no-share`, `sharing: false` and `PROMPTFOO_DISABLE_SHARING=true` block uploads; shared snapshots include prompts, variables and outputs.

```bash
# CI and Docker defaults worth setting
export PROMPTFOO_DISABLE_TELEMETRY=1 PROMPTFOO_DISABLE_UPDATE=1
export PROMPTFOO_CACHE_PATH="$HOME/.cache/promptfoo"
export PROMPTFOO_PYTHON=python3
```

---
## See also
- [promptfoo — LLM Evals & Red Teaming from YAML](./index.md)
- [promptfoo — Providers](./02-providers.md)
- [promptfoo — Test Cases & Assertions](./03-test-cases-assertions.md)
- [Langfuse — Prompt Management](../langfuse/03-prompt-management.md)
- [Docker & Docker Compose — Overview](../docker/index.md)
- [Eval Harness — Tools, Testing & CI](../../ai-harness/04-eval-harness-tools-ci.md)
