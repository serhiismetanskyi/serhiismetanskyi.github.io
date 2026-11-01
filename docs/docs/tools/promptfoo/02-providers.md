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

# promptfoo — Providers

A provider is whatever answers a prompt: a hosted model, a local runtime, your own HTTP API or a script. `providers` and `targets` are interchangeable keys. Every provider can be listed several times with different configs and compared in the same run.

## Provider Syntax

```yaml
providers:
  - openai:gpt-6-luna                      # string form
  - id: anthropic:messages:claude-sonnet-5-5
    label: claude-sonnet                   # column name in the report
    config:                                # provider options
      temperature: 0
      max_tokens: 1024
  - file://providers/gateway.yaml          # provider options in a separate file
```

| Provider id | Target |
|-------------|--------|
| `openai:<model>`, `openai:chat:<model>`, `openai:responses:<model>`, `openai:embedding:<model>` | OpenAI and OpenAI-compatible APIs |
| `anthropic:messages:<model>` | Anthropic Messages API |
| `azure:chat:<deployment>`, `azure:responses:<deployment>`, `azure:embedding:<deployment>` | Azure OpenAI deployments |
| `bedrock:<model-id>` | Amazon Bedrock |
| `google:<model>`, `vertex:<model>` | Gemini via AI Studio / Vertex AI |
| `ollama:chat:<model>`, `ollama:<model>` | Local Ollama |
| `docker:<model>`, `litellm:<model>`, `openrouter:<model>` | Docker Model Runner, LiteLLM proxy, OpenRouter |
| `http` / `https` / `https://host/path` | Your own HTTP endpoint |
| `file://x.py`, `file://x.js`, `file://x.go`, `exec:cmd` | Custom code |
| `echo` | Returns the prompt as the output |
| `mcp` | Calls MCP tools directly |
| `promptfoo:simulated-user` | Simulated user for multi-turn tests |

## Hosted Models

### OpenAI

```yaml
providers:
  - id: openai:chat:gpt-6-luna          # Chat Completions
    config:
      reasoning_effort: none            # none allows temperature and function calling on this family
      temperature: 0
      max_completion_tokens: 512
  - id: openai:gpt-6-sol                # Responses API by default for current models
    config:
      reasoning: { effort: low }
      max_output_tokens: 2048
```

`OPENAI_API_KEY` is read from the environment. Reasoning models ignore `temperature`; leave enough output budget because reasoning tokens count against it. `tools`, `tool_choice`, `response_format`, `functionToolCallbacks`, `passthrough` (extra request fields), `maxRetries`, `inputCost` / `outputCost` (dollars per token) are other common options.

### Anthropic

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-5-5
    config:
      max_tokens: 2048                  # includes thinking tokens
      temperature: 0
      # thinking: { type: adaptive, effort: high }
      # showThinking: false             # keep reasoning out of the output the assertions see
```

`ANTHROPIC_API_KEY` or `apiKey`. `tools` use the Anthropic shape (`name`, `input_schema`); `output_format` takes a JSON schema for structured output; prompts ending with an `assistant` message are rejected by newer models. Nested chat JSON prompts work: `system` messages become the API system prompt.

### Azure OpenAI

```yaml
providers:
  - id: azure:chat:my-gpt-deployment          # the deployment name, not the model name
    config:
      apiHost: your-resource.openai.azure.com
      # apiKey from AZURE_API_KEY; or service principal via AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID; or `az login`
```

### AWS Bedrock

```bash
npm install @aws-sdk/client-bedrock-runtime        # required by the provider
```

```yaml
providers:
  - id: bedrock:us.anthropic.claude-sonnet-5
    config:
      region: us-west-2
      max_tokens: 512
  - id: bedrock:arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/my-profile
    config:
      inferenceModelType: claude               # required for inference profile ARNs
```

Credentials come from the AWS SDK chain (env vars, `~/.aws`, instance roles). Model access, regions and guardrails are covered in [Amazon Bedrock](../../aws/bedrock/index.md).

### Google

```yaml
providers:
  - id: google:gemini-3.8-flash              # GOOGLE_API_KEY
    config:
      temperature: 0
      maxOutputTokens: 1024
  - id: vertex:gemini-3.8-flash              # Google Cloud credentials
    config:
      region: global
```

## Local Models and Gateways

```yaml
providers:
  - id: ollama:chat:llama3.3                 # OLLAMA_BASE_URL, default http://localhost:11434
    config:
      num_predict: 512                       # max_tokens is ignored by Ollama
      temperature: 0
      think: false                           # reasoning models: skip the trace, or set showThinking: false
  - id: docker:ai/llama3.2:3B-Q4_K_M         # Docker Model Runner
```

Reasoning models return a trace that is prepended to the output as `Thinking: ...`; combine `format` (JSON schema) with `think: false` for clean JSON. Runtime setup and model pulls: [Ollama](../ollama/index.md).

Anything that speaks the OpenAI protocol (vLLM, llama.cpp server, LiteLLM, an internal gateway) uses the OpenAI provider with `apiBaseUrl`:

```yaml
providers:
  - id: openai:chat:my-served-model           # model id exactly as the gateway lists it
    config:
      apiBaseUrl: http://localhost:4000/v1    # includes /v1, not /chat/completions
      apiKeyEnvar: GATEWAY_API_KEY            # no fallback to OPENAI_API_KEY
      omitDefaults: true                      # do not send promptfoo's default temperature / max tokens
defaultTest:
  options:
    provider:                                 # the grader does not inherit the gateway settings
      id: openai:chat:my-served-model
      config:
        apiBaseUrl: http://localhost:4000/v1
        apiKeyEnvar: GATEWAY_API_KEY
```

`apiBaseUrl` also works for `openai:embedding:<model>` (used by `similar` and `answer-relevance`). Setting `OPENAI_API_BASE_URL` redirects OpenAI providers without per-provider config. See [LiteLLM](../../libs/litellm/index.md) for a proxy in front of many vendors.

## HTTP Provider: Test Your Own API

The HTTP provider turns any endpoint into a target: build the request from the prompt and variables, then extract the answer from the response.

```yaml
providers:
  - id: http
    label: support-api
    config:
      url: https://staging.example.com/api/chat
      method: POST                              # set it explicitly
      headers:
        Content-Type: application/json
        x-promptfoo-session: '{{sessionId}}'
      auth:
        type: bearer                            # also: api_key, basic, oauth
        token: '{{env.APP_TOKEN}}'
      body:
        message: '{{prompt}}'
        locale: '{{locale}}'                    # any test var
      transformResponse: |                      # JS expression: json, text, context.response
        {
          output: json.data.reply,
          metadata: { sources: json.data.sources },
          tokenUsage: { total: json.data.usage.tokens }
        }
      sessionParser: 'data.headers["x-session-id"]'
      validateStatus: status < 500              # default accepts every status code
defaultTest:
  options:
    transformVars: '{ ...vars, sessionId: context.uuid }'    # one conversation id per test
```

| Option | Use |
|--------|-----|
| `url`, `method`, `headers`, `body` (object or string), `queryParams` | Request; `{{prompt}}`, test vars, `{{env.X}}` and `{{evaluationId}}` are templated; nested objects need the Nunjucks `dump` filter |
| `request` | Raw HTTP request text (or `file://request.txt`), e.g. exported from Burp; `useHttps: true` for TLS; the `dump` filter escapes the prompt as JSON |
| `transformRequest` | Rewrite the prompt before it is placed in the body; `file://transforms/request.js` exporting `(prompt, vars, context) => ...` |
| `transformResponse` | JS expression, function or `file://parser.js:fn`. Return a string, or `{output, metadata, tokenUsage, guardrails}`. Default: parsed JSON, else raw text |
| `validateStatus` | Which status codes are not errors, e.g. `status >= 200 && status < 300` |
| `auth` | `bearer`, `api_key` (`keyName`, `placement: header / query`), `basic`, `oauth` (client credentials or password grant), `signatureAuth` |
| `sessionParser` | Extract a server session id from `data.headers` or `data.body`; reuse it as `{{sessionId}}` in later turns |
| `multipart` | Form fields and file uploads (`kind: field` / `file`) |
| `tls` | Client certificates, CA bundles, `rejectUnauthorized` |
| `maxRetries` | Retries for transient failures (default 4) |
| `tools`, `tool_choice`, `transformToolsFormat` | Send OpenAI-format tools converted for the target API |

Return `metadata` for data that assertions need but the user never sees (retrieved chunks, sources, trace ids). It is available as `context.metadata` in `javascript` / `python` assertions and in `contextTransform`.

## Custom Code Providers

```python
# providers/app_provider.py
def call_api(prompt, options, context):
    prefix = options.get("config", {}).get("prefix", "")
    return {
        "output": f"{prefix}{run_my_app(prompt, context['vars'])}",
        "tokenUsage": {"total": 120, "prompt": 80, "completion": 40},
        "metadata": {"sources": ["kb/refunds.md"]},
    }
```

```javascript
// providers/provider.js
module.exports = class AppProvider {
  constructor(options) { this.providerId = options.id || 'app-js'; this.config = options.config || {}; }
  id() { return this.providerId; }
  async callApi(prompt, context) {
    const res = await fetch('http://localhost:8080/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, user: context.vars.user }),
    });
    const json = await res.json();
    return { output: json.reply, metadata: { sources: json.sources } };
  }
};
```

```yaml
providers:
  - id: file://providers/app_provider.py            # call_api by default; file://x.py:other_fn picks a function
    label: python-app
    config: { prefix: 'APP: ', workers: 2 }          # workers: parallel Python processes, default 1
  - file://providers/provider.js                     # also .mjs and .ts
  - id: file://providers/provider.go                 # Go (experimental): func CallApi(prompt, options, ctx) (map[string]interface{}, error)
  - 'exec:python3 providers/chain.py'                # argv: prompt, options JSON, context JSON; stdout is the output
```

| Return field | Meaning |
|--------------|---------|
| `output` | String or object the assertions run on (required unless `error`) |
| `error` | Marks the row as an error |
| `tokenUsage`, `cost`, `latencyMs`, `cached` | Reported usage; `cost` feeds the `cost` assertion |
| `metadata`, `sessionId` | Extra data and session id |
| `guardrails` | `{flagged, flaggedInput, flaggedOutput, reason}` for `guardrails` assertions (not available from `exec:`) |

Python providers run in persistent worker processes. Select the interpreter with `PROMPTFOO_PYTHON`, `pythonExecutable` in the provider config, or a virtualenv on `PATH`. `context` carries `vars`, `prompt`, `test` and, for red team probes, `test.metadata.pluginId` / `strategyId`.

## Comparing Models Side by Side

```yaml
prompts:
  - id: file://prompts/gpt_style.json
    label: gpt-style
  - id: file://prompts/claude_style.txt
    label: claude-style

providers:
  - id: openai:chat:gpt-6-luna
    label: luna
    prompts: [gpt-style]                  # this provider only gets this prompt
  - id: anthropic:messages:claude-sonnet-5-5
    label: sonnet
    prompts: [claude-style]
  - id: openai:chat:my-local-model
    label: local
    config: { apiBaseUrl: http://localhost:8000/v1 }

tests:
  - vars: { question: 'How long do refunds take?' }
    providers: [luna, sonnet]             # a test can also be restricted to providers
    assert:
      - type: contains
        value: 14 days
```

`promptfoo eval --filter-providers 'luna|sonnet'` runs a subset. Add `latency` and `cost` assertions (with `--no-cache`) or named metrics with `weight: 0` to put speed and price next to quality in the same table. Put the same `tools` list on several providers with a YAML anchor (`tools: &tools` ... `tools: *tools`); promptfoo converts the OpenAI-style definition for Anthropic, Bedrock and Google.

## Concurrency, Rate Limits and Retries

| Control | Effect |
|---------|--------|
| `-j N` / `--max-concurrency N` / `evaluateOptions.maxConcurrency` | Upper bound of parallel calls (default 4) |
| `--delay <ms>` / `evaluateOptions.delay` / `PROMPTFOO_DELAY_MS` | Fixed pause between calls |
| Adaptive scheduler | Halves concurrency on HTTP 429, reads `retry-after` and rate-limit headers, grows again after successes; `PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER=true` turns it off |
| `maxRetries` in provider config | Retries per provider (`0` to fail fast) |
| `PROMPTFOO_REQUEST_BACKOFF_MS`, `PROMPTFOO_RETRY_5XX=true` | Backoff base (default 5000 ms), retry HTTP 500 |
| `evaluateOptions.timeoutMs` / `PROMPTFOO_EVAL_TIMEOUT_MS`, `maxEvalTimeMs` / `PROMPTFOO_MAX_EVAL_TIME_MS`, `REQUEST_TIMEOUT_MS` | Per-call timeout, whole-run limit, HTTP request timeout |
| `-j 1` | Sequential execution; applied automatically when a prompt uses `_conversation` |
| `promptfoo eval --retry-errors`, `--resume` | Recover from provider outages without repeating finished rows |

Python providers have their own limit (`workers`) and a default call timeout of 5 minutes (`timeout` in ms, or `REQUEST_TIMEOUT_MS`).

---
## See also
- [promptfoo — LLM Evals & Red Teaming from YAML](./index.md)
- [promptfoo — Setup & Config](./01-setup-config.md)
- [promptfoo — Test Cases & Assertions](./03-test-cases-assertions.md)
- [Amazon Bedrock — Foundation Models, Converse API & Guardrails](../../aws/bedrock/index.md)
- [Ollama — Local LLM Runtime](../ollama/index.md)
- [LiteLLM — One API for 100+ LLM Providers](../../libs/litellm/index.md)
- [MLflow — Experiment Tracking, LLM Tracing & Evaluation](../mlflow/index.md)
