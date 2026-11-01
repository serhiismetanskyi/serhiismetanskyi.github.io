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

# promptfoo — RAG, Agents & Multi-turn

Beyond single prompts: evaluating retrieval-augmented answers, multi-turn conversations, tool calling, agent traces and MCP servers, plus the patterns that keep prompt comparisons and regression sets manageable.

## RAG Evals

Evaluate retrieval and generation separately so a failure points at one stage.

| Stage | What to check | How |
|-------|---------------|-----|
| Retrieval | Right documents come back | Provider that returns the retrieved chunks; `contains-all`, `context-recall` |
| Generation | Answer is correct and grounded | Fixed `context` var; `factuality`, `context-faithfulness`, `answer-relevance` |
| End to end | The deployed pipeline answers correctly | HTTP / custom provider for the app; chunks returned in `metadata` |

### Retrieval only

```python
# providers/retrieve.py — the "model" is your retriever
def call_api(query, options, context):
    docs = vector_store.query(query)                       # your code
    return {"output": "\n".join(f"{d.name}: {d.text}" for d in docs)}
```

```yaml
prompts: ['{{query}}']
providers: [file://providers/retrieve.py]     # several retrievers side by side compare vector stores
tests:
  - vars: { query: 'What is our reimbursement policy?' }
    assert:
      - type: contains-all
        value: [reimbursement.md, 'Employee Reimbursement Policy']
```

### Generation with fixed context

```yaml
prompts:
  - |
    Answer using only the documents.
    <QUERY>{{query}}</QUERY>
    <DOCUMENTS>{{context}}</DOCUMENTS>
providers: [openai:chat:gpt-6-luna]
tests:
  - vars:
      query: What is the maximum purchase that needs no approval?
      context: file://docs/reimbursement.md        # or a list of chunks, or a script: file://load_context.py
    assert:
      - type: contains
        value: '$500'
      - type: factuality
        value: The employee's manager approves larger purchases
      - type: context-faithfulness
        threshold: 0.9
      - type: answer-relevance
        threshold: 0.8
```

A script var is `def get_var(var_name, prompt, other_vars): return {"output": retrieve(other_vars["query"])}`.

### End to end against the app

```yaml
providers:
  - id: http
    label: rag-api
    config:
      url: http://localhost:8080/api/rag
      method: POST
      headers: { Content-Type: application/json }
      body: { query: '{{prompt}}' }
      transformResponse: |                        # answer is the output, chunks ride along in metadata
        {
          output: json.answer,
          metadata: { contexts: json.contexts }
        }
defaultTest:
  assert:
    - type: context-faithfulness
      contextTransform: context.metadata.contexts
      threshold: 0.8
    - type: context-relevance
      contextTransform: context.metadata.contexts
      threshold: 0.3
tests:
  - vars: { query: 'How long do refunds take?' }
    assert:
      - type: context-recall
        contextTransform: context.metadata.contexts
        value: Refunds are issued within 14 days of purchase.
        threshold: 0.8
      - type: javascript                           # deterministic retrieval check
        value: context.metadata.contexts.some((c) => c.toLowerCase().includes('refund policy'))
```

| Assertion | Required vars / fields | Reads as |
|-----------|------------------------|----------|
| `context-faithfulness` | `query`, context | Share of answer claims supported by the context |
| `context-recall` | `value` (ground truth), context | Share of the ground truth found in the context |
| `context-relevance` | `query`, context | Share of the context needed for the query; low is not always bad, tune the threshold per set |
| `answer-relevance`, `factuality` | prompt / `value` | Answer addresses the question / agrees with the reference |

Context comes from a `context` var (string or list) or from `contextTransform`, which returns a non-empty string or list. If the var is named differently, map it in `contextTransform`. These are model-graded: pin the grader ([03](./03-test-cases-assertions.md)). [Ragas](../../libs/ragas/index.md) computes comparable retrieval and generation metrics inside Python test suites; promptfoo is the YAML harness with a UI and CI gate, and both can run over the same golden questions. Security checks for RAG (`rag-poisoning`, `rag-document-exfiltration`, `rag-source-attribution`, `indirect-prompt-injection`) are red team plugins, see [05](./05-redteam-ci.md).

## Multi-turn Conversations

```json
[
  {"role": "system", "content": "You are a support bot."},
  {% for completion in _conversation %}
  {"role": "user", "content": {{ completion.input | dump }}},
  {"role": "assistant", "content": {{ completion.output | dump }}},
  {% endfor %}
  {"role": "user", "content": {{ question | dump }}}
]
```

```yaml
prompts: [file://chat.json]
tests:
  - description: turn 1
    vars: { question: 'Hi, my name is Alice.' }
    metadata: { conversationId: thread-1 }          # tests with the same id share history
    options: { storeOutputAs: greeting }            # reuse the output as {{greeting}} later
  - description: turn 2 remembers the name
    vars: { question: 'What is my name?' }
    metadata: { conversationId: thread-1 }
    assert:
      - type: icontains
        value: alice
      - type: conversation-relevance
        threshold: 0.7
  - description: new thread starts clean
    vars: { question: Say hello }
    metadata: { conversationId: thread-2 }
    assert:
      - type: not-icontains
        value: alice
```

- `_conversation` is an array of `{prompt, input, output}` from earlier tests in the same `conversationId`; prompts that reference it run with concurrency 1. `PROMPTFOO_DISABLE_CONVERSATION_VAR` turns the variable off.
- A fixed history is just another var: `messages: [{user: ...}, {assistant: ...}]` in `defaultTest.vars`, dumped into the prompt with `{{ messages | dump }}`.
- For stateful endpoints send a session id per test: `options.transformVars: '{ ...vars, sessionId: context.uuid }'` and put `{{sessionId}}` in a header or body; `sessionParser` reads a server-issued id from the response.
- `promptfoo:simulated-user` plays the user for several turns (`config.instructions`, `maxTurns`, optional `initialMessages`) against the provider under test; set it as `defaultTest.provider` or per test.
- Multi-turn red team strategies (`crescendo`, `goat`, `jailbreak:hydra`) need a stateful target, see [05](./05-redteam-ci.md).

## Tool Calling and Structured Output

```yaml
providers:
  - id: openai:chat:gpt-6-luna
    label: agent
    config:
      reasoning_effort: none                     # function calling on Chat needs this for this model family
      tools:
        - type: function
          function:
            name: get_weather
            description: Get the current weather for a city
            parameters:
              type: object
              properties: { city: { type: string } }
              required: [city]
              additionalProperties: false
      tool_choice: auto                          # or {type: function, function: {name: get_weather}} to force one
  - id: openai:chat:gpt-6-luna
    label: triage
    config:
      response_format:
        type: json_schema
        json_schema:
          name: ticket_triage
          strict: true
          schema:
            type: object
            properties:
              priority: { type: string, enum: [P1, P2, P3, P4] }
              category: { type: string }
            required: [priority, category]
            additionalProperties: false
tests:
  - providers: [agent]
    vars: { question: 'What is the weather in Paris?' }
    assert:
      - type: is-valid-openai-tools-call
      - type: tool-call-f1
        value: [get_weather]
      - type: javascript
        value: |
          const calls = Array.isArray(output) ? output : output.tool_calls;
          const args = JSON.parse(calls[0].function.arguments);
          return calls.length === 1 && calls[0].function.name === 'get_weather' && args.city === 'Paris';
      - type: finish-reason
        value: tool_calls
  - providers: [triage]
    vars: { question: 'Triage this ticket: I was charged twice' }
    assert:
      - type: javascript                          # schema output arrives parsed
        value: output.priority === 'P1' && output.category === 'billing'
```

| Provider | Tool shape | Structured output |
|----------|------------|-------------------|
| OpenAI Chat | `{type: function, function: {name, parameters}}` | `response_format` (`json_schema`) |
| OpenAI Responses | `{type: function, name, parameters}` | `response_format` (sent as `text.format`) |
| Anthropic | `{name, input_schema}` | `output_format: {type: json_schema, schema}` |
| Ollama | OpenAI shape | `format` with a JSON schema (use `think: false` on reasoning models) |

Define tools once in the Chat shape and share them with a YAML anchor; promptfoo converts them for Anthropic, Bedrock and Google. `tools: file://tools.yaml` (or `file://tools.py:get_tools`) loads definitions from a file, `response_format: file://schema.json` loads a schema, and `tests[].options.response_format` switches the schema per test. Provider `functionToolCallbacks` call local functions and return their results as the output; there is no automatic model-to-tool loop, so full agent loops need a custom provider or an agent provider.

## Agent Traces and Trajectories

Trace assertions check what an agent did, not only what it said. Promptfoo runs an OTLP receiver (default port 4318) and passes a W3C `traceparent` to the provider; spans emitted under it are attached to the test.

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true          # port 4318
providers:
  - file://agent_provider.js                    # uses context.traceparent to export spans
tests:
  - vars: { question: 'Where is order 123?' }
    assert:
      - type: trajectory:tool-used
        value: search_orders
      - type: trajectory:tool-sequence
        value: { mode: exact, steps: [search_orders, compose_reply] }   # default mode: in_order
      - type: trajectory:tool-args-match
        value: { name: search_orders, args: { order_id: '123' } }       # mode: partial (default) or exact
      - type: trajectory:step-count
        value: { type: tool, max: 3 }
      - type: trace-span-count
        value: { pattern: 'tool.*', min: 2 }
      - type: trace-span-duration
        value: { pattern: 'tool.*', max: 2000 }
```

```javascript
// agent_provider.js (excerpt): report each tool call as a span below promptfoo's trace
// crypto = require('node:crypto'); t0, t1 = BigInt millisecond timestamps of the tool call
const [, traceId, parentSpanId] = (context.traceparent || '').split('-');
await fetch('http://127.0.0.1:4318/v1/traces', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: [{
    traceId, parentSpanId, spanId: crypto.randomBytes(8).toString('hex'), name: 'tool.search_orders', kind: 1,
    startTimeUnixNano: String(t0 * 1_000_000n), endTimeUnixNano: String(t1 * 1_000_000n),
    attributes: [{ key: 'tool.name', value: { stringValue: 'search_orders' } }],
  }] }] }] }),
});
```

Tool names are read from attributes such as `tool.name`, `function.name` and `gen_ai.tool.name`. With the OpenTelemetry SDK use `propagation.extract` on `traceparent` and a normal OTLP exporter. `trace-error-spans` checks error rates, `trajectory:goal-success` asks a judge whether the traced run reached a goal, and `javascript` / `python` assertions get `context.trace.spans`. Built-in providers (OpenAI, Anthropic, Azure, Bedrock, Vertex, Ollama, HTTP and others) add their own spans.

## MCP

```yaml
providers:
  - id: mcp                                     # test the MCP server itself
    config:
      enabled: true
      server:
        command: node
        args: ['mcp_server.js']                 # or url: https://host/mcp with auth and headers
        name: orders
      # server.tools / server.exclude_tools filter the tool list; timeout in ms; transformResponse reshapes the result
prompts: ['{{prompt}}']
tests:
  - vars:
      prompt: '{"tool": "get_order_status", "args": {"order_id": "ORD-1"}}'
    assert:
      - type: contains
        value: shipped
```

The prompt is a JSON `{tool, args}` call and the output is the raw MCP content blocks unless `transformResponse` reshapes them. To give MCP tools to a model under test, set `mcp.enabled: true` on `openai:chat` / `anthropic:messages` providers; executed calls appear in `metadata.toolCalls` for routing assertions. MCP-specific attacks use the `mcp` red team plugin.

## Comparing Prompt Versions

```yaml
prompts:
  - id: file://prompts/v1.txt
    label: v1-brief
  - id: file://prompts/v2.txt
    label: v2-polite
tests:
  - vars: { question: 'How long do refunds take?' }
    assert:
      - type: contains
        value: 14 days                          # absolute check for every version
      - type: select-best                       # relative check across versions in this row
        value: choose the most concise correct answer
```

Each prompt gets a column; compare pass rate and named metrics per column, or open two evals in the UI compare view. `select-best` fails the losers by design, so keep it out of gating suites. Keep one prompt file per version in git, label them, and use `--filter-prompts v2` to run a single one.

## Regression Sets and Scenarios

- **Golden set:** keep real failures as rows in `tests/regression.csv` (`question`, `__expected1`, `__metadata:source`). Add a row for every production bug; run it on each PR with deterministic assertions only.
- **Slices:** `metadata` plus `--filter-metadata area=billing` runs part of the set; `--filter-first-n` and `--filter-sample 20 --filter-sample-seed 1` give cheap smoke runs.
- **Failures first:** `promptfoo eval --filter-failing results.json` (or an eval id) re-runs only failing rows after a fix; `--retry-errors` repeats provider errors only.
- **Flakiness:** `--repeat 5 --no-cache` shows how often a test passes; gate on pass rate rather than a single sample.
- **Growth:** `promptfoo generate dataset` drafts extra inputs and `promptfoo generate assertions` drafts checks from the prompts.

`scenarios` cross a set of data with a set of tests:

```yaml
scenarios:
  - description: Support questions per locale
    config:                                     # each entry is a vars set
      - vars: { locale: en }
      - vars: { locale: de }
    tests:                                      # every test runs for every vars set
      - description: capital question
        vars: { question: 'What is the capital of France?' }
        assert:
          - type: icontains
            value: paris
```

---
## See also
- [promptfoo — LLM Evals & Red Teaming from YAML](./index.md)
- [promptfoo — Test Cases & Assertions](./03-test-cases-assertions.md)
- [promptfoo — Red Teaming, Testing & CI](./05-redteam-ci.md)
- [Ragas — Evaluation for LLM, RAG and Agent Applications](../../libs/ragas/index.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
- [Langfuse — Datasets & Evaluations](../langfuse/04-datasets-evaluations.md)
- [Arize Phoenix — LLM Tracing & Evaluation](../phoenix/index.md)
