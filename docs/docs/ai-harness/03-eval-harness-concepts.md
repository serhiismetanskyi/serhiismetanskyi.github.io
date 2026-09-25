---
date: 2026-09-25
tags:
  - llm
  - evaluation
  - harness
  - testing
  - metrics
---

# Eval Harness — Concepts & Metrics

## What Is an Evaluation Harness

An **evaluation harness** is the infrastructure that runs evals end to end:
it gives the agent instructions and tools, runs tasks (often in parallel), records every step,
grades the results and aggregates the scores.

For a QA engineer it is the test framework of the AI world:

| Classic test automation | Eval harness |
|---|---|
| Test case | **Task** — input + success criteria |
| Test run | **Trial** — one attempt at a task |
| Assertion | **Grader** — checks one aspect of the result |
| Test log | **Transcript / trajectory** — every message and tool call |
| System state after the test | **Outcome** — final state of the environment |
| Test suite | **Suite** — a set of tasks with a shared purpose |
| Pass / fail | Score, pass rate, pass@k, pass^k |

The main difference: the system under test is **non-deterministic**. The same task can pass once
and fail the next time, so one run proves very little.

## How a Harness Runs an Eval

```
Suite
 ├── Task 1 ──► Trial 1 ──► agent runs in a clean environment ──► transcript + outcome
 │         ├──► Trial 2 ──► ...
 │         └──► Trial k ──► ...
 ├── Task 2 ...
 ▼
Graders (code / model / human) ──► scores per trial
 ▼
Aggregation ──► pass rate, pass@k, pass^k, cost, latency ──► report / CI gate
```

Every trial must start from a **clean, isolated environment**. Shared state between trials
(leftover files, caches, a warmed-up database) creates correlated failures and fake passes.

## Grader Types

| Grader | How it works | Strengths | Weaknesses | Use for |
|---|---|---|---|---|
| **Code-based** | Exact match, regex, tests, schema checks, state checks | Fast, cheap, reproducible | Brittle, can reject valid alternatives | Structured output, code, final state |
| **Model-based (LLM-as-judge)** | A model scores the output against a rubric | Handles open-ended answers | Non-deterministic, biased, needs calibration | Tone, helpfulness, reasoning quality |
| **Human** | Experts review results | Gold standard | Slow, expensive | Calibrating judges, final sign-off |

**Rules of thumb:**
- Prefer **deterministic graders** where possible.
- Grade the **outcome**, not every step — rigid step checks punish valid alternative paths.
- Allow **partial credit** for multi-part tasks.
- Known LLM-judge biases: **position** (prefers the first answer) and **verbosity** (prefers longer answers).
  Use pass/fail or pairwise judgements and control for length.
- **Calibrate** every judge against human labels before you trust it.

## pass@k vs pass^k

With a per-trial success rate `p` and `k` trials:

| Metric | Meaning | Formula | Question it answers |
|---|---|---|---|
| **pass@k** | At least one of k trials succeeds | `1 − (1 − p)^k` | *Can* the agent solve it? |
| **pass^k** | All k trials succeed | `p^k` | Can users *rely* on it every time? |

Example with `p = 0.8`:

| k | pass@k | pass^k |
|---|---|---|
| 1 | 80% | 80% |
| 3 | 99.2% | 51.2% |
| 5 | 99.97% | 32.8% |

As `k` grows, pass@k goes to 100% and pass^k goes to 0%. A demo needs pass@k; **production needs pass^k**.

## Capability vs Regression Evals

| | Capability eval | Regression eval |
|---|---|---|
| Question | What can the system do now? | Did we break something that worked? |
| Expected pass rate | Low at the start, grows over time | Near 100% |
| In CI | Tracked as a trend | Hard gate — blocks the merge |
| Lifecycle | Tasks graduate into the regression suite once they pass reliably | Grows with every fixed bug |

Watch for **saturation**: when a capability suite is close to 100%, it stops telling you anything — add harder tasks.

## Building an Eval Suite: Roadmap

1. **Start early and small** — 20–50 tasks taken from real failures are enough to begin.
2. **Convert what you already have** — manual checks, bug reports and support tickets become tasks.
3. **Write unambiguous tasks** — two experts should agree on the verdict. Keep a **reference solution** for each task.
4. **Balance the cases** — include negative cases (the agent should refuse, ask, or do nothing).
5. **Isolate the environment** — clean state per trial, pinned resources.
6. **Choose graders** — code first, model where needed, humans to calibrate.
7. **Read transcripts** — regularly, not only when a score drops.
8. **Maintain the suite** — fix broken tasks, retire saturated ones, add new failures.

## Pitfalls

| Pitfall | What happens | Prevention |
|---|---|---|
| Shared state between trials | Correlated failures, fake passes | Fresh environment per trial |
| Ambiguous task spec | Graders disagree, scores are noise | Reference solution, expert review |
| Rigid step-checking | Valid alternative solutions fail | Grade the outcome |
| Buggy grader | Wrong scores look like model problems | Test graders on known good/bad answers |
| Single trial | Random luck decides the result | Several trials, report pass@k and pass^k |
| Infrastructure noise | Scores change with CPU/RAM/timeouts | Pin resources; treat them as a variable |
| Contamination | Benchmark data leaked into training → inflated scores | Private task sets; decontamination checks |
| "Vibe-based evals" | Decisions made on a few manual chats | Logged, repeatable suites |

Infrastructure alone can move agent benchmark scores by several points — Anthropic measured a swing
of about 6 points on Terminal-Bench 2.0 from resource configuration only.

## Non-Determinism and Cost

- Run each task **several times** (epochs / trials) and report the spread, not just the mean.
- Set **limits per sample**: messages, tokens, time.
- **Record and replay** model responses for tests that don't need a live model.
- Use **smaller models** and low max-token limits in integration tests; save full runs for nightly jobs.
- Cache results in CI where the tool supports it.

---
## Sources
- Anthropic — [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) (Jan 2026)
- OpenAI — [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- EleutherAI — [Decontamination in lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness/blob/main/docs/decontamination.md)
- Inspect AI — [Options: epochs and limits](https://inspect.aisi.org.uk/options.html)
- Anthropic — [Quantifying infrastructure noise in agentic coding evals](https://x.com/AnthropicAI/status/2019501512200974686) (Feb 2026)

## See also
- [AI Harness](index.md)
- [Eval Harness — Tools, Testing & CI](04-eval-harness-tools-ci.md)
- [DeepEval — LLM Testing Guide](../llm-evaluation/index.md)
- [QA & Testing Methodology](../qa-methodology/index.md)
