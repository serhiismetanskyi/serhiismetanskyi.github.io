---
date: 2026-06-22
tags:
  - ai-agents
  - llm
  - rag
---

# Memory & Retrieval-Augmented Generation (RAG)

## Memory Architecture

Agents usually use two memory layers:

### Short-Term Memory (STM)

- Holds the current reasoning chain and tool outputs (often thousands of tokens)
- Lives in the **LLM context window** or a fast in-memory cache
- Is cleared or archived after task completion

### Long-Term Memory (LTM)

- Persistent knowledge across sessions: user profiles, past tasks, domain facts
- Implemented with a **Vector DB** or another knowledge store
- Promotion rule: move significant facts from STM to LTM after each milestone

```
if outcome.is_significant or outcome.reusable:
    embed(summary) → store in vector_db with metadata
```

## RAG Pipeline

### Phase 1 — Indexing (offline)

```
Documents → Chunking → Embedding Model → Vector Database
               │              │                  │
          split into     convert each       store vectors
         text chunks    chunk to vector    with metadata
```

### Phase 2 — Query (runtime)

```
User Query → Embedding Model → Similarity Search (Vector DB)
                                        │
                                   Top-K Chunks
                                        │
                          ┌─── Context Assembly ───┐
                          │  System Prompt          │
                          │  + Retrieved Chunks     │
                          │  + User Query           │
                          └─────────────────────────┘
                                        │
                                  LLM → Answer
```

**4 RAG components:**
1. **Embedding model** — converts queries and docs into dense vectors
2. **Vector Database** — stores vectors and supports ANN search
3. **Retriever logic** — query -> embed -> top-k match -> inject context
4. **Freshness strategy** — TTL, streaming updates, or live API fallback

> **Alternative:** [Vectorless RAG](08-vectorless-rag.md) eliminates embeddings
> entirely — uses LLM reasoning over hierarchical document structure instead.

## Retrieval Methods

| Method | Principle | Best When |
|--------|-----------|-----------|
| **Dense retrieval** | Neural embeddings (semantics) | Conceptual similarity |
| **Sparse retrieval** | BM25 / TF-IDF (keywords) | Exact term matching |
| **Hybrid search** | Dense + Sparse (RRF fusion) | Best overall recall |
| **Re-ranking** | LLM/cross-encoder on top-100 | High precision required |

**RRF formula:** `score(d) = Σ 1 / (k + rank_i(d))`, where `k=60`

## Chunking Strategies

| Strategy | Size | Overlap | When |
|----------|------|---------|------|
| Fixed-size window | 512 tokens | 50–100 | Homogeneous text |
| Semantic segmentation | Varies | — | Structured documents |
| Sentence-based | 1–5 sentences | 1 sentence | FAQ, Q&A |
| Sliding window | 256–1024 | 25% | Long connected text |

**Rule:** `chunk_size <= (context_window - system_prompt_tokens - response_budget) / top_k`.

## Vector Databases

| DB | Type | Key Features | Scale | Pricing |
|----|------|-------------|-------|---------|
| **Pinecone** | Managed SaaS | Auto-scaling, hybrid search, HA | Billions of vectors | From $0 (Starter) |
| **Weaviate** | OSS / Cloud | GraphQL, knowledge graph, multi-modal | Horizontal scaling | Cloud ~$75/mo; OSS free |
| **Qdrant** | OSS / Cloud | Rust engine, metadata filtering, ACID | Distributed | Cloud ~$30/mo; OSS free |
| **Milvus** | OSS / Cloud | GPU support, cloud-native, many index types | Billions of vectors | Zilliz ~$0.10/hr; OSS free |
| **Chroma** | OSS Library | Python-native, developer-friendly | Moderate scale | Free |
| **FAISS** | OSS Library | Fastest ANN, GPU/C++, manual sharding | Single machine | Free |

**Quick choice guide:** Pinecone/Qdrant for production, Weaviate for GraphQL-heavy stacks, Milvus for ultra-scale, Chroma/FAISS for development.

**Index types:** HNSW (production default, high speed/accuracy), IVF (large datasets, lower RAM), PQ (compression), Flat (dev/exact).

**Key embedding models:** `text-embedding-3-large` (OpenAI, 3072d, high quality) · `text-embedding-3-small` (OpenAI, 1536d, fast) · `e5-large-v2` (HuggingFace, 1024d) · `all-MiniLM-L6-v2` (HuggingFace, 384d, lightweight).

---

## RAG in Chatbots — Intent Handling & Tag-Based Flow

Wrapping LLM output in structured tags lets the app layer detect **intent**,
track **conversation state**, and route to the right retriever deterministically,
without a separate classifier model.

### Tag Schema (System Prompt Instruction)

```
Always respond in this exact XML format:
<intent>booking | search | faq | cancel | unknown</intent>
<entities>{"slot": "value", ...}</entities>
<state>greeting | slot_filling | confirmation | executing | done</state>
<missing_slots>["unfilled", "required", "slots"]</missing_slots>
<response>User-facing text here.</response>
```

Example — user says *"Book me a flight to Chicago next week"*:
```xml
<intent>booking</intent>
<entities>{"destination": "Chicago", "date": "next week"}</entities>
<state>slot_filling</state>
<missing_slots>["exact_date", "budget", "return_date"]</missing_slots>
<response>What exact date and budget do you have in mind?</response>
```

### Conversation State Machine

```
greeting → intent_detection ──→ unknown ──→ clarify
                │
                ▼
        slot_filling ◄──────────── missing slots
                │  (all slots filled)
                ▼
        confirmation ── rejected ──→ slot_filling
                │  confirmed
                ▼
        executing (RAG query + tool call)
                │
                ▼
              done
```

The app reads `<state>` on each turn, so it does not need an extra LLM call to decide the next step.

### Intent → Retriever Routing

```python
INTENT_ROUTER = {
    "booking": {"retriever": flight_hotel_db, "tools": ["search_flights", "search_hotels"]},
    "faq":     {"retriever": faq_vector_db,   "tools": []},
    "cancel":  {"retriever": policy_db,       "tools": ["cancel_booking"]},
    "unknown": {"retriever": general_kb,      "tools": []},
}
# Smaller specialized indices → faster + more precise; no irrelevant context in prompt
```

### Tag Documents at Index Time

```python
vector_db.upsert([
    {"id": "d1", "vector": embed(text), "metadata": {"intent": "faq",     "topic": "cancellation"}},
    {"id": "d2", "vector": embed(text), "metadata": {"intent": "booking", "topic": "flights"}},
])

# Filter retrieval by detected intent tag
results = vector_db.query(
    vector=embed(user_query),
    filter={"intent": {"$eq": detected_intent}},
    top_k=5
)
```

### Slot Filling via LTM

```python
# User: "same trip as last time but in May"
past = ltm.search("previous Chicago booking", top_k=1)
pre_filled = extract_slots(past)
# → {"destination": "Chicago", "airline": "United", "hotel": "Marriott"}
# Only "exact_date" is missing — ask for it once
```

### Full Tagged Flow (per Turn)

| Turn | App reads | App does |
|------|-----------|----------|
| 1 | `<intent>` | Route to retriever + tool set |
| 2+ | `<state>slot_filling` + `<missing_slots>` | Ask for next missing slot |
| N | `<state>confirmation` | Show summary, await yes/no |
| N+1 | `<state>executing` | RAG query (intent-filtered) + tool call |
| Final | `<state>done` | Close conversation turn |
