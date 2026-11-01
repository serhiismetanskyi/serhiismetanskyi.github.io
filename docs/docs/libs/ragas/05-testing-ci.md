---
date: 2026-10-25 12:00:00
tags:
  - python
  - libraries
  - ragas
  - rag
  - llm-evaluation
  - testing
---

# Ragas — Testing & CI

Two things need tests. **Your harness** (data loading, metric wiring, gate logic) is ordinary code and must run offline, fast and free. **Your system's quality** needs a real judge LLM, costs money and varies a little between runs, so it runs in a separate job with explicit thresholds. This page builds both on `pytest` ([pytest](../pytest/index.md)) and GitHub Actions.

## Test Layers

| Layer | Judge | Checks | Runs |
|-------|-------|--------|------|
| Harness unit tests | `InstructorBaseRagasLLM` subclass with scripted answers | Metric arithmetic, prompt contents, gate logic | Every commit, no key |
| Request-path test | Local OpenAI-compatible fake server | `llm_factory`, Instructor, SDK and client settings work end to end | Every commit, no key |
| Free retrieval metrics | none (`IDBased*`, `NonLLM*`, [02](./02-rag-metrics.md)) | Retriever recall and precision against gold passages | Every commit |
| Judged quality gate | Real model, fixed and cached | Mean scores, per-sample floors, baseline regression | Nightly, on demand, labelled PRs |

Files: `evals/datasets/golden.jsonl` (reviewed rows with `user_input`, `reference`, `retrieved_contexts`), `evals/harness.py` (`ascore_dataset` from [01](./01-datasets-samples-setup.md)), `evals/scoring.py`, `evals/fake_judge.py`, `tests/conftest.py`, `tests/baseline.json`, `tests/test_pipeline_unit.py`, `tests/test_quality_gate.py`. `pytest.ini` holds `pythonpath = .`, `testpaths = tests`, `addopts = -m "not ragas"` and `markers = ragas: calls the judge LLM`.

## Offline Tests of Your Harness

`InstructorBaseRagasLLM` has two methods (`generate`, `agenerate`), so a scripted judge is a few lines. Metrics call `agenerate(prompt, ResponseModel)` and expect a Pydantic object back, so the script returns objects keyed by model name and records every prompt. Response-model names (`StatementGeneratorOutput`, `NLIStatementOutput`, `ContextRecallOutput`, ...) come from each metric's `util` module.

```python
import asyncio

import pytest
from openai import AsyncOpenAI
from ragas.llms import InstructorBaseRagasLLM, llm_factory
from ragas.metrics.collections import Faithfulness
from ragas.metrics.collections.faithfulness.util import (
    NLIStatementOutput, StatementFaithfulnessAnswer, StatementGeneratorOutput,
)

from evals.fake_judge import FakeJudge


class ScriptedJudge(InstructorBaseRagasLLM):
    """Returns prepared Pydantic objects keyed by response-model name and records the prompts."""

    def __init__(self, script):
        self.script, self.prompts = script, []

    def generate(self, prompt, response_model):
        raise NotImplementedError("metrics call agenerate")

    async def agenerate(self, prompt, response_model):
        self.prompts.append(prompt)
        return self.script[response_model.__name__]


def test_faithfulness_is_fraction_of_supported_statements():
    flags = [1, 1, 1, 0]
    judge = ScriptedJudge({
        "StatementGeneratorOutput": StatementGeneratorOutput(statements=["a", "b", "c", "d"]),
        "NLIStatementOutput": NLIStatementOutput(statements=[
            StatementFaithfulnessAnswer(statement=s, reason="r", verdict=v) for s, v in zip("abcd", flags)]),
    })
    result = Faithfulness(llm=judge).score(
        user_input="q", response="Paris is in France.", retrieved_contexts=["The capital is Paris."])
    assert result.value == pytest.approx(0.75)
    assert "Paris is in France." in judge.prompts[0]          # statement generation sees the response
    assert "The capital is Paris." in judge.prompts[1]        # verdicts see the retrieved context


def test_request_path_through_instructor_and_the_openai_sdk():
    fake = FakeJudge({
        "StatementGeneratorOutput": {"statements": ["a", "b"]},
        "NLIStatementOutput": {"statements": [{"statement": "a", "reason": "r", "verdict": 1},
                                              {"statement": "b", "reason": "r", "verdict": 0}]},
    })

    async def run():
        client = AsyncOpenAI(base_url=fake.base_url, api_key="sk-test", max_retries=0)      # created inside the loop
        llm = llm_factory("gpt-4o-mini", client=client)
        return await Faithfulness(llm=llm).ascore(user_input="q", response="r", retrieved_contexts=["c"])

    assert asyncio.run(run()).value == 0.5
    assert [title for title, _ in fake.calls] == ["StatementGeneratorOutput", "NLIStatementOutput"]
```

The second test sends real HTTP through Instructor and the OpenAI SDK to `FakeJudge`, so it catches wiring mistakes (wrong `base_url`, a sync client) that the scripted judge cannot. The fake reads the schema Instructor puts after `json_schema:` in the system message, looks up the scripted answer by schema title and returns a chat completion. An unscripted call fails with `KeyError`, which doubles as an assertion that the number of judge calls did not change.

```python
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FakeJudge:
    """OpenAI-compatible server; `script` maps a response-model name to a dict or a callable(prompt) -> dict."""

    def __init__(self, script):
        self.script, self.calls = script, []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["content-length"])))
                system = next(m["content"] for m in body["messages"] if "json_schema:" in str(m["content"]))
                title = json.loads(system.split("json_schema:")[1].split("Make sure to return")[0])["title"]
                prompt = body["messages"][-1]["content"]
                outer.calls.append((title, prompt))
                answer = outer.script[title]
                content = json.dumps(answer(prompt) if callable(answer) else answer)
                data = json.dumps({
                    "id": "fake", "object": "chat.completion", "created": 0, "model": body["model"],
                    "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": content}}],
                    "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120},
                }).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}/v1"
```

## The Judged Quality Gate

`run_suite` calls your system for each golden row and returns one scored DataFrame. The session fixture runs it once inside one event loop; every test asserts on that frame.

```python
import json
import os
from pathlib import Path

import pandas as pd
from openai import AsyncOpenAI
from ragas import EvaluationDataset, SingleTurnSample
from ragas.cache import DiskCacheBackend
from ragas.llms import llm_factory
from ragas.metrics.collections import ContextRecall, Faithfulness

from evals.harness import ascore_dataset

GOLDEN = Path("evals/datasets/golden.jsonl")             # {"user_input", "reference", "retrieved_contexts"} per line


async def run_suite(answer_fn, concurrency: int = 4) -> pd.DataFrame:
    rows = [json.loads(line) for line in GOLDEN.read_text().splitlines() if line.strip()]
    samples = [SingleTurnSample(response=answer_fn(r["user_input"]), **r) for r in rows]     # run the system under test
    model = os.getenv("JUDGE_MODEL", "gpt-4o-mini")
    llm = llm_factory(
        model,
        client=AsyncOpenAI(timeout=60, max_retries=2),   # created inside the running loop; reads OPENAI_API_KEY / OPENAI_BASE_URL
        temperature=0,
        cache=None if os.getenv("RAGAS_NO_CACHE") else DiskCacheBackend(f".ragas_cache/{model}"),   # key ignores the model: one dir per model
    )
    metrics = [Faithfulness(llm=llm), ContextRecall(llm=llm)]
    return await ascore_dataset(EvaluationDataset(samples=samples), metrics, concurrency=concurrency)
```

```python
import asyncio
import os

import pytest

from evals.scoring import run_suite


def my_rag_app(question: str) -> str:
    return "Refunds are accepted within 30 days of purchase."        # replace with your pipeline


@pytest.fixture(scope="session")
def scores():
    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not set")
    df = asyncio.run(run_suite(my_rag_app))                          # one event loop, one run, many assertions
    df.to_csv("eval-results.csv", index=False)                       # uploaded as a CI artifact
    return df
```

```python
import json
from pathlib import Path

import pytest

pytestmark = pytest.mark.ragas

THRESHOLDS = {"faithfulness": 0.85, "context_recall": 0.80}   # aggregate gate: mean over the golden set
SAMPLE_FLOOR = {"faithfulness": 0.50}                        # per-sample gate: no single answer below this
MAX_NAN_RATE = 0.05
BASELINE = Path(__file__).parent / "baseline.json"
TOLERANCE = 0.03


def test_judge_calls_succeeded(scores):
    for metric in THRESHOLDS:
        nan_rate = scores[metric].isna().mean()
        assert nan_rate <= MAX_NAN_RATE, f"{metric}: {nan_rate:.0%} of judge calls failed"


@pytest.mark.parametrize("metric,threshold", THRESHOLDS.items())
def test_mean_score(scores, metric, threshold):
    mean = scores[metric].mean()                              # pandas skips NaN, so test_judge_calls_succeeded guards them
    assert mean >= threshold, f"{metric} mean {mean:.3f} < {threshold}"


@pytest.mark.parametrize("metric,floor", SAMPLE_FLOOR.items())
def test_no_catastrophic_sample(scores, metric, floor):
    bad = scores[scores[metric] < floor]
    assert bad.empty, "below floor:\n" + bad[["user_input", metric]].to_string()


def test_no_regression_against_baseline(scores):
    baseline = json.loads(BASELINE.read_text())
    for metric, old in baseline.items():
        assert scores[metric].mean() >= old - TOLERANCE, f"{metric} dropped from {old:.3f}"
```

Run offline tests with `pytest` and judged tests with `pytest -m ragas -o addopts=""`. Without `OPENAI_API_KEY` the judged tests are skipped, not failed.

| Gate | Catches | Weakness |
|------|---------|----------|
| Mean per metric | Broad quality loss | A few terrible answers hide behind many good ones |
| Per-sample floor | Single hallucinations, empty answers | One noisy verdict can fail the build: keep the floor low, print the rows |
| NaN rate | Judge outages, bad data, schema failures | None; without it a failing judge makes the mean look fine |
| Baseline regression | Slow drift that never crosses an absolute threshold | Needs a deliberate baseline update |

## Non-Determinism and Baselines

| Source | Control |
|--------|---------|
| Judge sampling | `temperature=0`, one fixed judge model, disk cache (identical prompt, identical verdict) |
| System under test | Fix its temperature or seed; for stochastic systems store `response` in the golden file and score the stored answers |
| Small sample | With 30 rows one flipped verdict moves a mean by about 0.03; derive `TOLERANCE` from measured spread |
| Judge change | New judge model or prompt shifts every score: re-baseline in the same pull request |

Measure the spread by running the suite five times with `RAGAS_NO_CACHE=1` and taking the standard deviation of each metric mean; set `TOLERANCE` to at least twice that. Rewrite `tests/baseline.json` with a small script that first asserts `df[metrics].notna().all().all()`, so a failed judge cannot record a baseline, and commit the diff in a reviewed pull request so a lower number is a visible decision.

## GitHub Actions

```yaml
name: rag-evals
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled]
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:

env:
  RAGAS_DO_NOT_TRACK: "true"

jobs:
  unit:                                    # no judge calls, no secrets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync --locked
      - run: uv run pytest -q              # pytest.ini deselects -m ragas

  judged:                                  # nightly, on demand, or on PRs labelled "run-evals"
    if: github.event_name != 'pull_request' || contains(github.event.pull_request.labels.*.name, 'run-evals')
    needs: unit
    runs-on: ubuntu-latest
    timeout-minutes: 30
    concurrency: { group: "rag-evals-${{ github.ref }}", cancel-in-progress: true }
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync --locked
      - uses: actions/cache@v4
        with:
          path: .ragas_cache
          key: ragas-${{ hashFiles('uv.lock', 'evals/datasets/golden.jsonl') }}
          restore-keys: ragas-
      - run: uv run pytest -q -m ragas -o addopts=""
        env: { OPENAI_API_KEY: "${{ secrets.OPENAI_API_KEY }}", JUDGE_MODEL: gpt-4o-mini }
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: eval-results, path: eval-results.csv }
```

- Secrets are not exposed to pull requests from forks, so the judged job effectively runs for branches in the repository, on the schedule and on demand.
- The cache is keyed by prompt content, so a stale hit cannot answer a different prompt; it can answer with another *model's* verdict if one directory serves several models, hence one directory per judge model in `scoring.py`.

## Cost Control

| Lever | Effect |
|-------|--------|
| 20-50 golden rows, fewer metrics per row | Judge calls scale linearly with rows; `NoiseSensitivity` costs `2k + 3` calls and `ContextPrecision` `k` ([02](./02-rag-metrics.md)); run them nightly or on a slice |
| Cheaper judge on PRs, stronger judge nightly | Separate `JUDGE_MODEL` and baseline per job |
| Disk cache | Reruns of the same commit cost nothing |
| `llm_factory(..., max_retries=1)` | Each Instructor retry is billed; cap the waste on a model that cannot produce the schema |

`result.total_cost()` works only for legacy `evaluate()` with a LangChain-wrapped judge. For the `ascore` path, count tokens at the HTTP layer; the OpenAI SDK accepts an `httpx` client with response hooks:

```python
import httpx
from openai import AsyncOpenAI

tokens = {"calls": 0, "input": 0, "output": 0}


async def count(response: httpx.Response):                      # runs for every judge response
    await response.aread()
    usage = response.json().get("usage") or {}
    tokens["calls"] += 1
    tokens["input"] += usage.get("prompt_tokens", 0)
    tokens["output"] += usage.get("completion_tokens", 0)


client = AsyncOpenAI(http_client=httpx.AsyncClient(event_hooks={"response": [count]}))
# build the client inside the coroutine that runs the suite, pass it to llm_factory, compare `tokens` with a budget
```

## Common Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ModuleNotFoundError: langchain_community.chat_models.vertexai` on `import ragas` | `langchain-community` 0.4.2 | `uv add "langchain-community<0.4.2"` |
| `TypeError: Cannot use agenerate() with a synchronous client` | `OpenAI()` or `litellm.completion` | `AsyncOpenAI()`, `litellm.acompletion` |
| Intermittent `InstructorRetryException: Connection error` | One async client reused across several `asyncio.run()` calls | Build the client inside the coroutine; one `asyncio.run` per session |
| `unexpected keyword argument 'temperature'` | Anthropic SDK without sampling parameters | Pop `temperature` and `top_p` ([01](./01-datasets-samples-setup.md)) |
| `InstructorRetryException` with a validation error | Judge reply does not match the schema (weak or local model, truncated output) | Stronger model, larger `max_tokens`, JSON-mode support on the server |
| NaN in some or all rows | Empty or missing field (`ValueError: response is missing`), failed judge call, wrong key, `base_url` or model name | Read the printed exception; run one `ascore` call outside the helper |
| Legacy `evaluate()`: NaN and `Exception raised in Job[N]` | Timeout, parsing failure, rate limit | Raise `RunConfig.timeout`, lower `max_workers`, `raise_exceptions=True` while debugging |
| HTTP 429 | Too many concurrent judge calls | Lower `concurrency`; keep `AsyncOpenAI(max_retries=2)` |
| Scores unchanged after switching the judge | Cache directory shared between models | One directory per model, or clear it |

## QA Checklist

1. `langchain-community<0.4.2` and `ragas` pinned in the lock file; `RAGAS_DO_NOT_TRACK=true` in CI.
2. Harness unit tests run on every commit with no API key.
3. Async client created inside the loop; concurrency bounded by a semaphore.
4. Judge model, temperature 0 and prompts fixed; one cache directory per judge model.
5. Golden set reviewed by a person, stored as JSONL, changed only on purpose.
6. Gates: mean per metric, per-sample floor, NaN rate, baseline with a measured tolerance.
7. Baseline updated by a script that refuses partial data, in a reviewed pull request.
8. Judged job separated from the unit job (timeout, `concurrency` group, uploaded `eval-results.csv`); token usage counted against a budget.

---
## See also
- [Ragas — Evaluation for LLM, RAG and Agent Applications](./index.md)
- [Ragas — Datasets, Samples & Setup](./01-datasets-samples-setup.md)
- [Ragas — RAG Metrics](./02-rag-metrics.md)
- [Pytest — Python Testing Framework](../pytest/index.md)
- [Eval Harness — Tools, Testing & CI](../../ai-harness/04-eval-harness-tools-ci.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
- [promptfoo — LLM Evals & Red Teaming from YAML](../../tools/promptfoo/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [OWASP LLM Security](../../owasp-llm-security/index.md)
