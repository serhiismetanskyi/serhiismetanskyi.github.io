---
date: 2026-06-23
tags:
  - ai-agents
  - llm
  - context-engineering
---

# Agentic Search & Context Engineering (2025+)

## Context Engineering vs Prompt Engineering

Prompt engineering optimizes **wording**. Context engineering optimizes the agent's entire **execution environment** — system instructions, tool definitions, retrieved documents, conversation history, and agent state.

As Andrej Karpathy defines it: *"the delicate art and science of filling the context window with just the right information for the next step."*

Key insight: a focused **20K-token context** typically outperforms a bloated 200K-token context. What you **leave out** matters as much as what you include.

## Why Agentic Search Matters

Classic RAG is often "retrieve once -> answer once".

Modern agentic systems use a different model:

1. Retrieve from multiple sources
2. Plan next retrieval actions
3. Execute tools in sequence or parallel
4. Re-rank and compress context
5. Repeat until confidence threshold is reached

In short: the agent **builds its own context** instead of consuming one static retrieval result.

## Classic RAG vs GraphRAG vs Agentic RAG

### 1) Classic RAG

Flow: `Query -> Embed -> Vector Search -> Top-K -> LLM Answer`.

- Fast, cheap, easy to implement.
- Great for simple document Q&A and FAQ-like tasks.
- Weak for multi-hop questions where evidence is scattered across sources.
- Retrieval-only behavior: no adaptive reasoning loop.

### 2) GraphRAG

Flow: `Query -> Entity/Relation extraction -> Graph traversal -> Connected evidence -> LLM Answer`.

- Encodes relationships between people, systems, events, and concepts.
- Strong for multi-hop reasoning and cross-document synthesis.
- Best fit for relationship-heavy domains (legal, biomedical, compliance, incident forensics).
- Higher setup and maintenance cost (graph build, updates, governance).

### 3) Agentic RAG

Flow: `Query -> Planner chooses retrieval actions -> Multi-step retrieval -> Self-evaluation -> Iterate -> Final answer`.

- Agent decides **what** to retrieve, **when**, and **whether evidence is sufficient**.
- Can combine vector search + graph lookup + web search + tools in one run.
- Highest accuracy ceiling for ambiguous, composite, or evolving questions.
- Trade-offs: higher latency/token cost and harder debugging/observability.

Real difference:
- **Classic RAG retrieves**
- **GraphRAG connects**
- **Agentic RAG reasons**

## Context Sources

| Source | Typical Data | Best Retrieval Mode | Common Risk |
|---|---|---|---|
| Database | transactions, metrics, entities | filtered SQL/ES|QL, semantic + structured search | over-fetching rows |
| Filesystem | docs, code, runbooks | keyword + semantic file search | stale local snapshots |
| Web | real-time facts, updates | web search + page fetch | untrusted/unsafe content |
| Memory | session history, long-term traces | vector memory lookup + recency scoring | memory drift |

## Retrieval Toolset (Combined)

An agentic retrieval stack usually mixes:

- **DB retrieval tool** for structured, fresh operational data
- **File retrieval tool** for internal docs and repository knowledge
- **Web retrieval tool** for external and time-sensitive information
- **Memory tool** for prior session decisions and user preferences
- **Re-ranking/compression tool** to fit context budget before model call

Design principle: each tool returns **small, typed payloads** that are easy to score and merge.

## From "Retrieve Once" to "Context Construction Loop"

```text
User Goal
   ->
Intent Classifier
   ->
Planner (build retrieval plan)
   ->
Tool Executor (DB / FS / Web / Memory)
   ->
Context Synthesizer (dedupe + rank + compress)
   ->
LLM Reasoning
   ->
Need more evidence?
   -> yes: loop
   -> no: final answer with citations
```

## Core Architecture Pattern

Use a four-part loop:
1. **Intent-aware retrieval policy** (map query type to DB/FS/Web/Memory tools).
2. **Planner budgets** (max rounds/calls/tokens/time/freshness).
3. **Context synthesis** (normalize, dedupe, hybrid-rank, compress).
4. **Evidence-aware answering** (sources used, conflicts, uncertainty).

GraphRAG extends step 1/3 by adding entity-relation retrieval for multi-hop evidence when flat vector search is insufficient.

## Context Failure Modes

| Failure Mode | What Happens | Fix |
|---|---|---|
| **Poisoning** | Hallucination enters context, propagates as ground truth through all future steps | Validate tool outputs, tag confidence levels, never mix untrusted data with instructions |
| **Distraction** | Accumulated context overwhelms training knowledge (accuracy drops ~32K tokens) | Compress aggressively, use sub-agents for noisy work |
| **Confusion** | Irrelevant info influences decisions (more tools = worse, even when everything fits) | Curate tool surface, remove unused tools per task |
| **Clash** | Different context parts disagree without resolution | Add conflict detection, prefer recent + authoritative sources |
| **Rot** | Context degrades over many turns as stale observations accumulate | Periodic compaction, tool-result clearing, session splits |

Cascade risk: one poisoned observation propagates through the entire agent loop (act → observe → plan → act), compounding errors for 20+ steps.

## Compression Strategies

| Strategy | How | When |
|---|---|---|
| **Offload** | Move large artifacts to filesystem, replace with pointer + summary | Tool returns >1K tokens |
| **Summarize** | Compress conversation history preserving: objectives, key decisions, artifacts, next steps | Context budget >70% |
| **Tool-result clearing** | Drop old re-fetchable tool outputs, keep record that call happened | After results are consumed |
| **Sub-agent isolation** | Delegate noisy/long work to separate context window | Investigation, large file reads |

Multi-stage compaction: some systems use 5-stage progressive compression triggered at budget thresholds (70%→99%), preserving recent tool outputs at full fidelity.

## Practical Python Skeleton

```python
def build_context(goal: str) -> list[RetrievedItem]:
    plan = plan_retrieval(goal)
    raw = [run_tool(s.tool_name, s.params) for s in plan]
    return compress_context(rerank(normalize_all(raw)), token_budget=4000)
```

## Evaluation Metrics for Agentic Search

| Metric | What It Shows |
|---|---|
| Retrieval Precision@k | relevance of retrieved items |
| Coverage/Recall | whether key evidence was missed |
| Context Utility Score | how much retrieved context improved final answer |
| Tool Efficiency | answer quality per tool call |
| Freshness Accuracy | percentage of answers based on up-to-date evidence |
| Hallucination Rate | unsupported claims in final response |

Track these per intent category, not only globally.

## Security and Governance

Mandatory controls for agentic retrieval:

- strict allowlist of URLs/domains for web fetch
- query validation and parameterized DB access
- redaction of secrets/PII before context merge
- max rounds, max calls, and timeout per tool
- provenance logging for each retrieved evidence item

## Implementation Checklist

1. Define intent classes and retrieval policies.
2. Implement minimal toolset (DB + files + web + memory) with planner budgets.
3. Add context dedupe, ranking, compression, provenance, and citations.
4. Test adversarial scenarios and monitor precision/recall/latency/tool cost.

---

## See also
- [AI Coding Agents: Skills & Claude Code](../ai-skills/index.md)
- [Tool Integration & Prompt Engineering](04-tool-integration-prompting.md)
- [Memory, RAG & Knowledge](03-memory-rag.md)
- [Testing, Evaluation & Observability](06-testing-observability.md)
