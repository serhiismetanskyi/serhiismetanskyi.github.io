---
date: 2026-08-07
tags:
  - llm
  - evaluation
  - deepeval
  - rag
---

# DeepEval Guide — Part 15: RAG Diagnostic Testing

Based on the [Improving Retrieval Quality](https://testerstories.com/2026/02/ai-and-testing-improving-retrieval-quality-part-1/)
series by Jeff Nyman (TesterStories, Feb 2026).

## The Problem

You built a RAG system (Part 14), ran metrics, and got low scores. Now what?
This part shows a **systematic diagnostic methodology** to find the root cause.

---

## Phase 1: Establish a Baseline

Always start with a baseline configuration before changing anything:

```python
BASELINE = {"chunk_size": 1000, "chunk_overlap": 200, "k": 3}

retriever, num_chunks = create_rag_system(**BASELINE)
results = run_rag_test(
    retriever=retriever,
    question="What energy source does the paper propose?",
    expected_output="Matter/antimatter annihilation requiring 10^28 kg.",
)
# Record: Contextual Precision = 0.33, Faithfulness = 0.67
```

**Document your baseline scores** — all future experiments compare to this.

---

## Phase 2: Parameter Tuning Experiments

Run 4 experiments, changing ONE variable at a time:

### Experiment 1: Smaller Chunks

```python
retriever, _ = create_rag_system(chunk_size=500, chunk_overlap=100, k=3)
# Hypothesis: smaller chunks = more precise retrieval
```

### Experiment 2: More Retrieval (Higher k)

```python
retriever, _ = create_rag_system(chunk_size=1000, chunk_overlap=200, k=6)
# Hypothesis: more chunks = higher chance of finding relevant content
```

### Experiment 3: Both Combined

```python
retriever, _ = create_rag_system(chunk_size=500, chunk_overlap=100, k=6)
# Hypothesis: combining both improvements may compound benefits
```

### Experiment 4: Semantic Chunking

```python
from langchain_experimental.text_splitter import SemanticChunker
from langchain_ollama import OllamaEmbeddings

semantic_splitter = SemanticChunker(
    OllamaEmbeddings(model="nomic-embed-text"),
    breakpoint_threshold_type="percentile",
)
# Hypothesis: semantic boundaries produce more coherent chunks
```

### Recording Results

```python
experiments = {
    "baseline":       {"chunk_size": 1000, "chunk_overlap": 200, "k": 3},
    "small_chunks":   {"chunk_size": 500,  "chunk_overlap": 100, "k": 3},
    "more_retrieval": {"chunk_size": 1000, "chunk_overlap": 200, "k": 6},
    "both":           {"chunk_size": 500,  "chunk_overlap": 100, "k": 6},
}

for name, params in experiments.items():
    retriever, _ = create_rag_system(**params)
    results = run_rag_test(retriever, question, expected_output)
    scores = get_scores(results)
    print(f"{name}: CP={scores['Contextual Precision']}, "
          f"F={scores['Faithfulness']}")
```

**Semantic chunking** requires a different code path (see Experiment 4 above)
because it replaces `RecursiveCharacterTextSplitter` entirely.

**If ALL experiments fail to improve scores** — the problem is NOT
chunking strategy. Move to Phase 3.

---

## Phase 3: Query-Type Analysis

Instead of fixing the system, question whether it's actually broken.

### Insight: Different Queries Suit Different Content

Technical documents typically have four section types:

- **Conceptual** — intros, theory, literature reviews (many keywords)
- **Methodological** — procedures, equations, derivations (math-heavy)
- **Results** — data, calculations, specific numbers (number-heavy)
- **Discussion** — implications, interpretation (keywords again)

Semantic search works best on keyword-rich sections (conceptual, discussion)
because embedding models can match those terms easily. Math-heavy and
number-heavy sections have weak semantic signals, so factual queries
about specific numbers often fail — even though the answer is there.

### Test Multiple Query Types

```python
queries = [
    {
        "question": "How does manipulating extra dimensions create a warp bubble?",
        "expected": "Extra dimensions are compactified using Kaluza-Klein modes...",
        "type": "conceptual",
    },
    {
        "question": "What role do Kaluza-Klein modes play?",
        "expected": "Kaluza-Klein modes provide the theoretical basis...",
        "type": "conceptual",
    },
    {
        "question": "What energy source does the paper propose?",
        "expected": "Matter/antimatter annihilation requiring 10^28 kg.",
        "type": "factual",
    },
]

for q in queries:
    results = run_rag_test(retriever, q["question"], q["expected"])
    scores = get_scores(results)
    print(f"[{q['type']}] {q['question'][:50]}...")
    print(f"  CP={scores['Contextual Precision']}, F={scores['Faithfulness']}")
```

**Expected pattern:** Conceptual queries score near 1.0 while factual
queries score much lower. This proves the system works — just not for
all query types equally.

---

## The Diagnostic Cycle

```
Phase 1: Baseline              → "How bad is it?"
Phase 2: Parameter Tuning      → "Is it a configuration problem?"
Phase 3: Query-Type Tests      → "Is it a query-type problem?"
Phase 4: Cross-Document Tests  → "Is it a document-structure problem?"
```

| Phase | All fail | Some succeed | All succeed |
|-------|----------|-------------|-------------|
| 2 (params) | → Phase 3 | Use best config | Done ✅ |
| 3 (queries) | → Phase 4 | Query-type mismatch | System works ✅ |
| 4 (documents) | Fundamental issue | Structure-dependent | System works ✅ |

---

## Phase 4: Cross-Document Testing

Test the same config and queries on documents with **different structures**:

```python
documents = [
    {"path": "paper_equations.pdf", "type": "equation-heavy"},
    {"path": "paper_prose.pdf", "type": "prose-integrated"},
]

for doc in documents:
    retriever, _ = create_rag_system(doc["path"], **BASELINE)
    for q in queries:
        results = run_rag_test(retriever, q["question"], q["expected"])
        print(f"[{doc['type']}][{q['type']}] CP={get_scores(results)}")
```

**Key insight — document structure determines retrievability:**

- **Equation-heavy** docs (formulas in dedicated sections) — factual
  queries fail; semantic search can't match sparse numeric content
- **Prose-integrated** docs (equations in narrative) — factual queries
  succeed; surrounding text provides rich semantic signal

---

## Fixes for Retrieval Failures

1. **Hybrid search** — combine semantic + keyword (BM25) retrieval
2. **Metadata tags** — label sections as "theoretical" vs "calculation"
3. **Query routing** — route factual vs conceptual queries differently
4. **Multiple retrievers** — use different strategies per query type

---

## Key Lessons

1. **Test multiple query types** — conceptual, factual, and numerical
2. **Test multiple document types** — one document hides failure modes
3. **Change one variable at a time** — isolate each cause
4. **Low scores ≠ broken system** — they reveal operational characteristics
5. **Multidimensional testing** = configuration × query type × document type;
   single-dimension testing gives incomplete, misleading results

### Sources

- [Improving Retrieval Quality, Part 1](https://testerstories.com/2026/02/ai-and-testing-improving-retrieval-quality-part-1/)
- [Improving Retrieval Quality, Part 2](https://testerstories.com/2026/02/ai-and-testing-improving-retrieval-quality-part-2/)
- [Improving Retrieval Quality, Part 3](https://testerstories.com/2026/02/ai-and-testing-improving-retrieval-quality-part-3/)
- [Improving Retrieval Quality, Part 4](https://testerstories.com/2026/02/ai-and-testing-improving-retrieval-quality-part-4/)