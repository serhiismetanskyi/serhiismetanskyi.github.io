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

# promptfoo — Test Cases & Assertions

A test case is a set of `vars` plus `assert` checks; every test runs against every prompt and provider. Assertions return pass / fail and a score from 0 to 1, and are combined by weights and thresholds.

## Test Case Structure

```yaml
tests:
  - description: refund window          # shown in the table; --filter-pattern matches it
    vars:
      question: How long do refunds take?
      locale: en
    assert:
      - type: contains
        value: 14 days
    metadata:
      area: billing                     # --filter-metadata area=billing
    threshold: 0.8                      # minimum weighted score of all assertions
    options:
      repeat: 3                         # run this test three times
    providers: [gateway]                # only these providers (labels, ids, openai:*)
    prompts: [v2-polite]                # only these prompts (labels or ids)
```

| Field | Purpose |
|-------|---------|
| `vars` | Values for `{{placeholders}}`; arrays expand into the cross product; `file://` values load text, JSON / YAML, images, PDFs |
| `assert` | Assertions and `assert-set` groups |
| `threshold` | Overrides per-assertion verdicts: pass when the weighted score is at least this |
| `options` | `transform`, `transformVars`, `provider` / `rubricPrompt` (grader), `repeat`, `storeOutputAs`, `disableDefaultAsserts`, `disableVarExpansion`, `runSerially`; other keys (`response_format`, `temperature`) override provider config for this test |
| `providerOutput` | Skip the provider and assert on a saved output |
| `assertScoringFunction` | `file://scoring.js` that combines named metrics into one verdict |

## Loading Tests

| Source | Config | Notes |
|--------|--------|-------|
| Inline list | `tests: [...]` | Mixed with the sources below |
| YAML / JSON / JSONL files, globs | `tests: file://tests/*.yaml` | A directory or list of paths also works |
| CSV | `tests: file://cases.csv` | Header names become vars |
| Excel | `tests: file://cases.xlsx#Sheet2` | Needs `npm install read-excel-file` |
| Google Sheets | `tests: https://docs.google.com/spreadsheets/d/<id>/edit` | Public by link, or private with `GOOGLE_APPLICATION_CREDENTIALS` and `@googleapis/sheets` |
| Hugging Face | `tests: huggingface://datasets/rajpurkar/squad?split=validation&limit=100` | `HF_TOKEN` for private sets |
| Generator | `tests: file://gen_tests.py:create_tests` or `.js` | Returns a list of test cases; `{path, config}` passes parameters |
| Vars from code | `context: file://load_context.py` | JS `module.exports = async (varName, prompt, otherVars) => ({output})`, Python `get_var(var_name, prompt, other_vars)` |

```csv
question,__expected1,__expected2,__description,__metadata:area
What is the capital of France?,icontains: paris,not-contains: berlin,capital,geo
How long do refunds take?,contains: 14 days,regex: \d+ days,refund window,billing
```

CSV special columns: `__expected` / `__expected1..n` (`type: value`, `type(threshold): value`; a bare value means `equals`; `grade:` is `llm-rubric`, `fn:` is `javascript`), `__description`, `__prefix`, `__suffix`, `__metric`, `__threshold`, `__metadata:<key>`, `__config:__expected:<key>`. `contains-any` / `contains-all` take comma-separated values in CSV.

## Assertion Properties

| Property | Meaning |
|----------|---------|
| `type` | Assertion type; prefix with `not-` to invert most types |
| `value` | Expected value, schema, rubric text, `file://` path, or inline JS / Python |
| `threshold` | Minimum score or distance, for `similar`, `levenshtein`, `cost`, `latency`, `javascript`, `python`, model-graded types |
| `weight` | Relative importance, default 1; `0` records the metric without affecting the verdict |
| `metric` | Names a result column; assertions with the same name are aggregated |
| `transform` | Rewrites the output for this assertion only |
| `config` | Extra settings passed to custom assertions (`context.config`) |
| `provider`, `rubricPrompt` | Grader override and custom grading prompt for model-graded types |
| `contextTransform` | Builds the context for `context-*` assertions |

## Deterministic Assertions

| Type | Passes when | Example `value` |
|------|-------------|-----------------|
| `equals` | Output equals value (objects compared as JSON) | `P1` |
| `contains`, `icontains` | Substring present (case-insensitive for `i`) | `14 days` |
| `contains-any`, `contains-all`, `icontains-any`, `icontains-all` | Any / all of a list present | `[paris, france]` |
| `starts-with` | Output begins with value | `The capital` |
| `regex` | Output matches the regular expression | `'\d{4}-\d{2}-\d{2}'` |
| `is-json`, `contains-json` | Whole output / some part is JSON; optional JSON Schema in `value` | see below |
| `is-xml`, `contains-xml` | Well-formed XML; `value: {requiredElements: [order.id]}` | |
| `is-html`, `contains-html`, `is-sql`, `contains-sql` | Valid HTML / SQL | |
| `is-refusal` | Provider reports or text indicates a refusal; `not-is-refusal` requires an answer | |
| `levenshtein` | Edit distance at most `threshold` | `threshold: 5` |
| `word-count` | Number of words in range | `{min: 20, max: 100}` |
| `rouge-n`, `rouge-l`, `rouge-s`, `bleu`, `gleu`, `meteor` | Overlap score at least `threshold` | reference text |
| `latency` | Call time in ms below `threshold` | `5000` (use `--no-cache`) |
| `cost` | Provider-reported cost in USD below `threshold` | `0.01` (errors if the provider reports no cost) |
| `finish-reason` | `stop`, `length`, `content_filter` or `tool_calls` | `stop` |
| `perplexity`, `perplexity-score` | Needs provider log probabilities (OpenAI, Azure) | `threshold: 1.5` |
| `webhook` | Your service returns `{pass, score}` | URL |
| `guardrails` | Target-reported guardrail decision | |

```yaml
assert:
  - type: is-json
    value:
      type: object
      required: [priority, category]
      properties:
        priority: { type: string, enum: [P1, P2, P3, P4] }
        category: { type: string }
  - type: equals                       # pick a field, then compare
    value: P1
    transform: JSON.parse(output).priority
  - type: not-regex
    value: '\b\d{16}\b'                # no card-like numbers
  - type: word-count
    value: { max: 60 }
```

A `value` can use test vars (`value: '{{expected}}'`) and `file://` references; `normalizeUnicode: true` makes `equals` / `contains` ignore composed-versus-decomposed characters.

### Tool-call assertions

| Type | Checks |
|------|--------|
| `is-valid-openai-tools-call`, `is-valid-function-call` | Tool calls match the schema in the provider's `tools` / `functions` |
| `tool-call-f1` | F1 between expected tool names (`value: [get_weather]`) and called tools; `threshold` default 1.0; needs at least one expected name |
| `skill-used` | Provider metadata shows an expected skill |
| `trajectory:tool-used`, `tool-args-match`, `tool-sequence`, `step-count`, `goal-success` | Trace-based agent checks, see [04](./04-rag-agents-multiturn.md) |

With `openai:chat` the output is the array of tool calls, so a custom check reads `output[0].function.name` and `JSON.parse(output[0].function.arguments)`; for a plain text answer the output is a string.

### Similarity

```yaml
assert:
  - type: similar
    value: ['Refunds take 14 days', 'You get your money back within two weeks']
    threshold: 0.8                     # cosine similarity, default 0.75
    provider: openai:embedding:text-embedding-3-large
```

Embedding models come from the grader settings; `defaultTest.options.provider` can hold `text` and `embedding` entries separately.

## Model-Graded Assertions

| Type | `value` | Notes |
|------|---------|-------|
| `llm-rubric` | Criterion in plain language | Grader returns `{reason, score, pass}`; the rubric may use `{{vars}}` and may define its own scoring scale |
| `model-graded-closedqa` | Criterion | Y / N verdict |
| `factuality` (`model-graded-factuality`) | Reference statement | Categories A-E; weights via `options.factuality: {subset, superset, agree, disagree, differButFactual}` |
| `g-eval` | Criterion or list | Chain-of-thought scoring, default threshold 0.7 |
| `answer-relevance` | none | Judges the output against the prompt as the question; default threshold 0.5; uses a text and an embedding model |
| `context-faithfulness` | none | Needs `query` and `context`; share of answer claims supported by the context |
| `context-recall` | Ground-truth answer | Share of the ground truth attributable to the context |
| `context-relevance` | none | Share of the context needed to answer the query |
| `conversation-relevance` | none | Sliding window over `_conversation`; `config.windowSize` |
| `select-best` | Criterion | Compares outputs of all prompts / providers in one row; the winner passes, the rest fail |
| `max-score` | `{method: average, threshold: 0.7}` | Picks the output with the best score from the other assertions |
| `pi`, `classifier`, `moderation`, `search-rubric`, `agent-rubric` | varies | Dedicated scorer, Hugging Face classifier, OpenAI moderation, web-search or agent judge |
| `trajectory:goal-success` | Goal text | Judge reads the traced run |

Set the grader once; a full provider object keeps its `config`:

```yaml
defaultTest:
  options:
    provider:                           # grader for every model-graded assertion
      text:
        id: openai:gpt-6-sol
        config: { reasoning: { effort: none }, temperature: 0 }
      embedding:
        id: openai:embedding:text-embedding-3-large
    rubricPrompt: file://prompts/rubric.txt     # optional: {{output}} and {{rubric}}
tests:
  - vars: { question: 'What is the capital of France?' }
    assert:
      - type: llm-rubric
        value: States that the capital of France is Paris
      - type: factuality
        value: The capital of France is Paris
        provider: anthropic:messages:claude-sonnet-5-5   # per-assertion override
```

Grader precedence: `--grader`, then `assertion.provider`, then `options.provider` (test or `defaultTest`); `defaultTest.provider` also acts as a fallback, so use `options.provider` when you want a separate judge. Without any setting the grader is picked from the available credentials (OpenAI when several keys are set). Judges are non-deterministic: set `temperature: 0`, keep rubrics narrow and one-sided, and spot-check them against human labels.

## Custom Assertions

```yaml
assert:
  - type: javascript
    value: output.length < 200                         # expression: boolean or score
  - type: javascript
    value: file://assertions/graded.js
    config: { maxWords: 10 }
  - type: python
    value: file://assertions/check_json.py:get_assert  # default function name is get_assert
    metric: category_correct
```

| Return value | Meaning |
|--------------|---------|
| `true` / `false` | Pass / fail, score 1 / 0 |
| a number | Score; pass depends on `threshold` |
| `GradingResult` | `{pass, score, reason, namedScores, componentResults}` |

```javascript
// assertions/graded.js
module.exports = (output, context) => {
  // context: prompt, vars, test, config, provider, providerResponse, metadata, trace
  const words = output.split(/\s+/).length;
  return {
    pass: words <= context.config.maxWords,
    score: Math.max(0, 1 - words / 20),
    reason: `${words} words`,
    componentResults: [
      { pass: output.includes('Paris'), score: 1, reason: 'mentions Paris', namedScores: { mentions_paris: 1 } },
    ],
  };
};
```

```python
# assertions/check_json.py
import json

def get_assert(output, context):
    data = json.loads(output)
    expected = context["config"]["expected"]
    ok = data.get("category") == expected
    return {
        "pass": ok,
        "score": 1.0 if ok else 0.0,
        "reason": f"category={data.get('category')!r}, expected={expected!r}",
        "named_scores": {"category_correct": 1.0 if ok else 0.0},   # snake_case is mapped
    }
```

Multi-line inline scripts need an explicit `return`. A script that throws fails the assertion with the error as the reason. For objects (tool calls, parsed JSON from a provider) `output` keeps its type; JSON text stays a string, so use `JSON.parse(output)`. Python needs `PROMPTFOO_PYTHON` when the interpreter is not called `python`. Ruby assertions (`type: ruby`) follow the same contract.

## Combining Results

```yaml
defaultTest:
  assert:
    - type: latency
      threshold: 3000
      metric: latency_ok
      weight: 0                          # record, do not gate
tests:
  - vars: { question: 'What is the capital of France?' }
    threshold: 0.6                       # weighted average of every assertion, defaults included
    assert:
      - type: contains
        value: Paris
        weight: 3
        metric: accuracy
      - type: assert-set                 # 1 of 2 must pass
        threshold: 0.5
        metric: style
        assert:
          - type: icontains
            value: capital
          - type: contains
            value: '!'
derivedMetrics:                          # after the run, per prompt / provider
  - name: quality
    value: accuracy * 0.7 + style * 0.3
```

- Without a test `threshold`, every assertion with non-zero weight must pass. With one, the weighted mean decides (an assertion's own fail can be outvoted).
- `defaultTest.assert` entries are part of every test's average; use `weight: 0` for pure measurements or `options.disableDefaultAsserts: true` on tests that need their own set.
- `metric` names are aggregated across tests: per prompt and provider the report holds weighted sums, and `derivedMetrics` (mathjs expressions or JS functions, evaluated in order) read those sums. Divide by `__count` for averages (`accuracy / __count`).
- `assertScoringFunction: file://scoring.js` receives `(namedScores, context)` and returns `{pass, score, reason}`; every assertion needs a `metric`, and the score must be a finite number.
- Reuse blocks with `assertionTemplates` and `- $ref: '#/assertionTemplates/name'`.

## Transforms and Variables

| Hook | Where | Receives |
|------|-------|----------|
| `transformResponse` | HTTP provider | Raw response (`json`, `text`) |
| `options.transform` | Test or `defaultTest` | Provider output; applies to all assertions of the test |
| `assert[].transform` | Assertion | The test-transformed output; applies to that assertion |
| `contextTransform` | `context-*` assertions | Provider output plus `context.metadata`; returns a string or list |
| `options.transformVars` | Test or `defaultTest` | `vars` before templating, e.g. `{ ...vars, sessionId: context.uuid }` |

Transforms are JS expressions, `file://transform.js:fn` or `file://transform.py` (default function `get_transform`). Returning `null` or `undefined` is an error.

```bash
promptfoo eval --var locale=de                 # override a var for the whole run
promptfoo eval --repeat 5 --no-cache           # flakiness check: 5 samples per test
promptfoo eval --filter-metadata area=billing  # run one slice
```

## Developing Assertions Without a Model

```yaml
# echo returns the prompt as the output: the vars are the "model answer"
prompts: ['{{text}}']
providers: [echo]
tests:
  - vars: { text: 'Here is the result: {"priority": "P1", "category": "billing"} Thanks!' }
    assert:
      - type: contains-json
        value: { type: object, required: [priority] }
      - type: not-is-json
```

```bash
promptfoo eval --assertions asserts.yaml --model-outputs outputs.json   # score saved outputs, no provider calls
```

---
## See also
- [promptfoo — LLM Evals & Red Teaming from YAML](./index.md)
- [promptfoo — Providers](./02-providers.md)
- [promptfoo — RAG, Agents & Multi-turn](./04-rag-agents-multiturn.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [Langfuse — Datasets & Evaluations](../langfuse/04-datasets-evaluations.md)
