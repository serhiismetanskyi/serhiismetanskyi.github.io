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

# Ragas — RAG Metrics

A RAG system has two parts that fail differently: **retrieval** (did the right passages come back, in a useful order?) and **generation** (did the answer stay inside those passages and address the question?). Ragas scores each part separately, so a regression points at the retriever, the prompt or the model instead of at "the pipeline".

Import metrics from `ragas.metrics.collections`. Retrieval metrics with no LLM (`NonLLMContext*`, `IDBasedContext*`) exist only as legacy classes in `ragas.metrics` and are covered at the end.

## Metric Map

| Metric (collections class) | Part | Measures | Required inputs | Better |
|----------------------------|------|----------|-----------------|--------|
| `Faithfulness` | generation | Share of answer statements supported by the retrieved contexts | `user_input`, `response`, `retrieved_contexts` | higher |
| `AnswerRelevancy` | generation | Whether the answer addresses the question (embedding similarity to questions regenerated from the answer) | `user_input`, `response` + LLM and embeddings | higher |
| `ResponseGroundedness` | generation | Two-judge 0-2 rating of how well the contexts back the answer | `response`, `retrieved_contexts` | higher |
| `ContextPrecisionWithReference` (`ContextPrecision`) | retrieval | Useful contexts ranked early, judged against the reference answer | `user_input`, `reference`, `retrieved_contexts` | higher |
| `ContextPrecisionWithoutReference` (`ContextUtilization`) | retrieval | Same, judged against the generated answer | `user_input`, `response`, `retrieved_contexts` | higher |
| `ContextRecall` | retrieval | Share of reference-answer statements found in the contexts | `user_input`, `reference`, `retrieved_contexts` | higher |
| `ContextEntityRecall` | retrieval | Share of reference entities present in the contexts | `reference`, `retrieved_contexts` | higher |
| `ContextRelevance` | retrieval | Two-judge 0-2 rating of whether contexts are relevant to the question | `user_input`, `retrieved_contexts` | higher |
| `NoiseSensitivity` | both | Share of answer statements that are absent from the reference yet backed by a retrieved context | `user_input`, `response`, `reference`, `retrieved_contexts` | **lower** |
| `AnswerAccuracy` | answer | Two-judge 0-4 rating of the answer against the reference | `user_input`, `response`, `reference` | higher |
| `AnswerCorrectness`, `FactualCorrectness`, `SemanticSimilarity` | answer | Agreement with the reference ([03](./03-other-metrics-agents-custom.md)) | `response`, `reference` | higher |

Legacy names: `ResponseRelevancy` is `AnswerRelevancy`, `LLMContextRecall` is `ContextRecall`, `LLMContextPrecisionWithReference` / `LLMContextPrecisionWithoutReference` are the two context precision classes. Most collections metrics raise `ValueError` (for example `response is missing`) when a required field is empty.

```python
import asyncio

from openai import AsyncOpenAI
from ragas import EvaluationDataset
from ragas.embeddings.base import embedding_factory
from ragas.llms import llm_factory
from ragas.metrics.collections import (
    AnswerRelevancy, ContextPrecision, ContextRecall, Faithfulness,
)

from evals.harness import ascore_dataset          # the helper from page 01


async def main(dataset: EvaluationDataset):
    client = AsyncOpenAI()
    llm = llm_factory("gpt-4o-mini", client=client, temperature=0)
    emb = embedding_factory("openai", model="text-embedding-3-small", client=client)
    metrics = [
        Faithfulness(llm=llm),
        AnswerRelevancy(llm=llm, embeddings=emb),
        ContextPrecision(llm=llm),
        ContextRecall(llm=llm),
    ]
    return await ascore_dataset(dataset, metrics, concurrency=8)


df = asyncio.run(main(dataset))
print(df[["faithfulness", "answer_relevancy", "context_precision", "context_recall"]].mean())
```

## How Each Score Is Computed

| Metric | Procedure |
|--------|-----------|
| `Faithfulness` | The judge splits `response` into standalone statements (pronouns resolved, using `user_input`). A second call checks all statements against the retrieved contexts joined with newlines and returns a 0/1 verdict per statement. Score = supported / total. No statements gives NaN |
| `AnswerRelevancy` | The judge writes a question for the answer, `strictness` times (default 3, one call each), and flags whether the answer is non-committal. Score = mean cosine similarity between the original `user_input` and the generated questions, forced to 0 when every generation is non-committal |
| `ContextPrecision*` | One judge call per retrieved context returns a 0/1 "useful" verdict (against the reference or the response). Score = average precision over the ordered verdicts: sum of precision@i for each useful context i, divided by the number of useful contexts |
| `ContextRecall` | The reference answer is split into sentences; one judge call marks each as attributable to the joined contexts (1) or not (0). Score = attributed / total; no sentences gives NaN |
| `ContextEntityRecall` | Entities are extracted from the reference and from the joined contexts. Score = `|reference ∩ context| / |reference|` using exact string equality (case-sensitive) |
| `NoiseSensitivity` | Reference and response are split into statements; each is checked against every context and the response statements are checked against the reference. With `mode="relevant"` (default) the score is the share of response statements that the reference does not support but a *relevant* context does (a context that supports at least one reference statement); `mode="irrelevant"` counts statements supported only by contexts that support no reference statement. Lower is better |
| `ResponseGroundedness`, `ContextRelevance` | Two judge prompts each give 0, 1 or 2; score = mean of the two ratings divided by 2. A judge that fails 5 times is dropped; if both fail the result is NaN |
| `AnswerAccuracy` | Two judge prompts (the second sees reference and answer swapped) give 0, 2 or 4; score = mean divided by 4. Possible values: 0, 0.25, 0.5, 0.75, 1.0 |

`ContextPrecision` is rank-aware: the same useful context scores higher at position 1 than at position 3, so it reacts to re-ranking. `ContextRecall` ignores order and counts only what the reference needs.

## LLM Calls per Metric

Judge calls dominate cost and latency. `k` is the number of retrieved contexts. The calls inside one metric run one after another; different rows and metrics run concurrently.

| Metric | Judge calls | Embedding requests | Prompt size grows with |
|--------|-------------|--------------------|------------------------|
| `Faithfulness` | 2 | 0 | response length, all contexts joined |
| `AnswerRelevancy` | 3 (`strictness`) | 2 | response length only |
| `ContextPrecision*` | `k` | 0 | one context per call |
| `ContextRecall` | 1 | 0 | reference length, all contexts joined |
| `ContextEntityRecall` | 2 | 0 | all contexts joined |
| `NoiseSensitivity` | `2k + 3` | 0 | `k` contexts and every statement |
| `ResponseGroundedness`, `ContextRelevance`, `AnswerAccuracy` | 2 (up to 10 on retries) | 0 | contexts joined |
| `AnswerCorrectness` | 3 | 2 | response and reference |
| `FactualCorrectness` | 4 (`mode="f1"`) | 0 | response and reference |

A four-metric RAG suite (`Faithfulness`, `AnswerRelevancy`, `ContextPrecision`, `ContextRecall`) with `k=5` makes 2 + 3 + 5 + 1 = 11 judge calls per row. `NoiseSensitivity` with the same `k` adds 13 more, which is why it is usually run on a small slice. Each retry for invalid JSON is an extra billed call ([01](./01-datasets-samples-setup.md)).

## Reading the Scores

| Pattern | Likely cause | Look at |
|---------|--------------|---------|
| Low `ContextRecall`, any faithfulness | The retriever missed passages the reference needs | top-k, chunking, embedding model, query rewriting |
| Low `ContextPrecision`, good recall | Right passages are present but ranked low or buried in noise | re-ranker, smaller k, chunk size |
| Low `Faithfulness`, good recall | The model added claims beyond the contexts | prompt ("answer only from the context"), temperature, model choice |
| Good `Faithfulness`, low `AnswerRelevancy` | Answer is grounded but off-topic or evasive | prompt, query understanding |
| High `NoiseSensitivity` | Irrelevant or wrong passages leak into the answer | k, re-ranker, instruction to ignore unrelated passages |
| Low `ContextEntityRecall` only | Names, IDs or numbers from the reference are missing in the contexts | keyword or hybrid search |

Scores are relative measurements, not probabilities. Compare runs on the same dataset with the same judge and prompts; take thresholds from a measured baseline minus a tolerance ([05](./05-testing-ci.md)) rather than from a number in a blog post. Per-sample scores are noisy (one flipped verdict on a 4-statement answer moves `Faithfulness` by 0.25), so gate on means and on a floor for catastrophic samples, not on every row.

## When Each Metric Misleads

| Metric | Failure mode |
|--------|--------------|
| `Faithfulness` | Penalises true statements that are not in the contexts (general knowledge). An answer that refuses or says "not in the context" produces few or no statements and can score NaN |
| `AnswerRelevancy` | Measures topic similarity, not correctness: a wrong but on-topic answer scores high. "I don't know" scores 0 |
| `ContextPrecision` | Depends on the reference (or the answer); a wrong generated answer lowers the "without reference" variant even if retrieval was fine |
| `ContextRecall` | Only as good as the reference: a vague or incomplete reference inflates it, an over-long reference deflates it |
| `ContextEntityRecall` | Exact string match; "Acme Corp" and "Acme Corporation" count as different entities |
| `NoiseSensitivity` | Needs a correct reference; most rows score 0, so means move in small steps |
| two-judge metrics | Large jumps between 0.25 steps; NaN when both judges return invalid ratings |

Override a prompt to adapt a metric to your domain; the metric keeps its scoring code:

```python
from ragas.metrics.collections import ContextRecall
from ragas.metrics.collections.context_recall.util import ContextRecallPrompt


class StrictRecallPrompt(ContextRecallPrompt):
    instruction = ContextRecallPrompt.instruction + (
        "\nTreat numbers and dates as exact: a mismatch means the statement is not attributed."
    )


metric = ContextRecall(llm=llm)
metric.prompt = StrictRecallPrompt()
```

`Faithfulness` keeps two prompts: `statement_generator_prompt` and `nli_statement_prompt`. Prompt classes live in each metric's `util` module with their `*Input` / `*Output` models.

## Retrieval-Only Metrics Without an LLM

These legacy metrics compare retrieved passages with gold passages and cost nothing per run, so they suit large retriever sweeps and unit tests. They need `reference_contexts` (or the ID lists) in the sample, which test set generation provides ([04](./04-testsets-experiments.md)).

```python
import warnings
warnings.simplefilter("ignore", DeprecationWarning)         # ragas.metrics imports are deprecated

from ragas import SingleTurnSample
from ragas.metrics import (
    IDBasedContextPrecision, IDBasedContextRecall,
    NonLLMContextPrecisionWithReference, NonLLMContextRecall,
)

sample = SingleTurnSample(
    retrieved_contexts=["Paris is the capital of France.", "Berlin is in Germany.", "Eiffel Tower is in Paris"],
    reference_contexts=["Paris is the capital of France.", "Eiffel Tower is in Paris."],
    retrieved_context_ids=["a", "b", "c"],
    reference_context_ids=["a", "c"],
)
for metric in (NonLLMContextPrecisionWithReference(), NonLLMContextRecall(),
               IDBasedContextPrecision(), IDBasedContextRecall()):
    print(metric.name, await metric.single_turn_ascore(sample))      # inside an async function
```

| Metric | Inputs | Score |
|--------|--------|-------|
| `NonLLMContextPrecisionWithReference` | `retrieved_contexts`, `reference_contexts` | Each retrieved context counts as a hit when its best Levenshtein similarity to any reference context reaches `threshold` (0.5); score = average precision over the hit list, rank-aware like `ContextPrecision` |
| `NonLLMContextRecall` | same | Share of reference contexts whose best similarity to any retrieved context passes the threshold |
| `IDBasedContextPrecision` | `retrieved_context_ids`, `reference_context_ids` | Retrieved IDs that are in the reference, divided by the retrieved IDs (set-based, not rank-aware) |
| `IDBasedContextRecall` | same | Reference IDs that were retrieved, divided by the reference IDs |

The legacy classes also run through `evaluate()` ([01](./01-datasets-samples-setup.md)). String similarity needs `rapidfuzz`. ID matching is the most stable retrieval check when your corpus has stable chunk IDs; string similarity helps when chunks are re-split between runs.

!!! tip "Start with the free metrics"
    Run ID-based or string-similarity retrieval metrics on every commit and the LLM-judged suite nightly or on release. A retriever change that drops recall shows up in the free metrics first, without a judge bill.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Gating `Faithfulness` while ignoring `AnswerRelevancy` | An evasive answer is perfectly faithful | Gate both, or add a refusal-rate check |
| Comparing numbers across judge models | Scores shift with the judge | New judge, new baseline |
| Using `ContextPrecisionWithoutReference` as the retrieval metric | Wrong answers lower it | Use the reference variant when references exist |
| Treating NaN as 0 or dropping it silently | Judge failures hide regressions | Count NaN per metric and fail above a small rate |
| Running `NoiseSensitivity` on the whole set every commit | `2k + 3` calls per row | Slice of 10-20 rows, nightly |
| Forgetting that `Faithfulness` joins all contexts | Long contexts raise cost and dilute the judge | Smaller k or shorter chunks |

---
## See also
- [Ragas — Evaluation for LLM, RAG and Agent Applications](./index.md)
- [Ragas — Datasets, Samples & Setup](./01-datasets-samples-setup.md)
- [Ragas — Other Metrics, Agents & Custom](./03-other-metrics-agents-custom.md)
- [DeepEval — RAG Metrics](../../llm-evaluation/01_metrics/02_rag_metrics.md)
- [DeepEval — LLM Testing Guide](../../llm-evaluation/index.md)
- [Eval Harness — Tools, Testing & CI](../../ai-harness/04-eval-harness-tools-ci.md)
