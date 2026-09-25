---
date: 2026-06-23
tags:
  - ai-agents
  - llm
  - rag
---

# Vectorless RAG

## What Is Vectorless RAG?

Traditional RAG converts documents into vector embeddings and retrieves by similarity search.
Vectorless RAG eliminates embeddings entirely — it navigates document structure using
LLM reasoning, similar to how a human reads a table of contents to find the right section.

## Traditional RAG vs Vectorless RAG

```
Traditional RAG                     Vectorless RAG
─────────────                       ──────────────
Document                            Document
    ↓                                   ↓
Chunking                            Structured Index (tree)
    ↓                                   ↓
Embeddings                          Query Routing (LLM reasoning)
    ↓                                   ↓
Vector Database                     Hierarchical Navigation
    ↓                                   ↓
Similarity Search                   Precise Section Retrieval
    ↓                                   ↓
Top-K Chunks                        Relevant Pages/Sections
    ↓                                   ↓
LLM Output                          LLM Output
```

## How It Works

### Phase 1 — Indexing

The system builds a **hierarchical tree index** from the document's natural structure:
chapters → sections → subsections. Each node stores a title, summary, and page range.
No chunking or embedding is needed.

```
Document
├── Chapter 1: Introduction
│   ├── 1.1 Background (pp. 1–3, summary: "...")
│   └── 1.2 Problem Statement (pp. 4–5, summary: "...")
├── Chapter 2: Methodology
│   ├── 2.1 Data Collection (pp. 6–8, summary: "...")
│   └── 2.2 Analysis (pp. 9–12, summary: "...")
└── Chapter 3: Results (pp. 13–18, summary: "...")
```

### Phase 2 — Query (Reasoning-Based Retrieval)

```
User Query
    ↓
LLM reads tree structure (titles + summaries)
    ↓
LLM reasons: "Which branches answer this question?"
    ↓
Navigate to relevant nodes
    ↓
Extract full text from those sections
    ↓
LLM generates answer with page references
```

The LLM mimics how a human expert reads a document:

1. Look at the table of contents
2. Identify relevant sections by reasoning over summaries
3. Read the relevant content
4. Answer the question with traceable references

## Key Differences

| Aspect | Traditional RAG | Vectorless RAG |
|---|---|---|
| **Retrieval method** | Vector similarity (ANN) | LLM reasoning over tree structure |
| **Document processing** | Chunking + embedding | Hierarchical index (no chunking) |
| **Infrastructure** | Vector DB + embedding model | Document tree + LLM only |
| **Context preservation** | Chunks lose surrounding context | Full section context preserved |
| **Explainability** | Opaque similarity scores | Traceable reasoning path + page refs |
| **Latency** | Fast (vector lookup) | Slower (LLM reasoning per query) |
| **Scale** | Billions of vectors | Best for focused document sets |

## When to Use Each

| Use Case | Best Approach |
|---|---|
| Large unstructured corpora (research papers, web content) | **Traditional RAG** |
| Semantic search across many independent documents | **Traditional RAG** |
| Real-time retrieval over very large datasets | **Traditional RAG** |
| Long structured documents (legal, financial, technical) | **Vectorless RAG** |
| Compliance/audit (explainability required) | **Vectorless RAG** |
| Documents with clear hierarchy (manuals, reports) | **Vectorless RAG** |
| Mixed document types and query patterns | **Hybrid** (vector for broad, reasoning for precision) |

## PageIndex — Reference Implementation

[PageIndex](https://github.com/VectifyAI/PageIndex) (MIT licensed) is the primary
open-source framework for vectorless RAG:

```python
from pageindex import PageIndexClient

client = PageIndexClient(api_key="YOUR_KEY")

doc_id = client.submit_document("report.pdf")["doc_id"]

tree = client.get_tree(doc_id, node_summary=True)["result"]
```

Tree search via LLM reasoning:

```python
import json

search_prompt = f"""
You are given a question and a document tree structure.
Each node has a node_id, title, and summary.
Find all nodes likely to contain the answer.

Question: {query}
Document tree: {json.dumps(tree, indent=2)}

Reply as JSON: {{"thinking": "...", "node_list": ["id1", "id2"]}}
"""

result = await call_llm(search_prompt)
node_ids = json.loads(result)["node_list"]

context = "\n\n".join(node_map[nid]["text"] for nid in node_ids)
answer = await call_llm(f"Answer based on context:\n{context}\n\nQ: {query}")
```

## Hybrid Approach

Production systems increasingly combine both:

- **Vector search** for broad retrieval across many documents
- **Reasoning-based navigation** for precision within selected documents

```
Query → Vector DB (find relevant documents)
           ↓
     Top documents → Tree index (navigate to exact sections)
           ↓
     Precise context → LLM → Answer with page references
```

---

## See also
- [Memory & RAG](03-memory-rag.md)
- [Agentic Search & Context Engineering](07-agentic-search-context-engineering.md)
- [Tool Integration & Prompting](04-tool-integration-prompting.md)

### Sources

- [Vectorless Reasoning-Based RAG — Microsoft](https://techcommunity.microsoft.com/blog/azuredevcommunityblog/vectorless-reasoning-based-rag-a-new-approach-to-retrieval-augmented-generation/4502238)
- [PageIndex — GitHub](https://github.com/VectifyAI/PageIndex)
- [Vectorless RAG: Smarter AI Retrieval — Medium](https://medium.com/@amitech/vectorless-rag-smarter-ai-retrieval-without-the-complexity-862c3fdc877e)
