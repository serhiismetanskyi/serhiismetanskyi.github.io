---
date: 2026-08-07
tags:
  - llm
  - evaluation
  - deepeval
  - rag
---

# DeepEval Guide — Part 14: Practical RAG Testing

Based on the [AI and Testing](https://testerstories.com/2026/02/ai-and-testing-evaluation-and-deepeval/)
series by Jeff Nyman (TesterStories, Feb 2026).

## Why This Matters

Parts 2 and 12 describe RAG metrics and workflows in theory. This part
shows how to **build a real RAG pipeline, connect local LLMs via Ollama,
and evaluate retrieval quality** step by step.

---

## Setup: Ollama as Both Execution and Judge Model

Instead of using OpenAI for the judge, you can run everything locally:

```python
from langchain_ollama import OllamaEmbeddings, ChatOllama

# Execution model — generates answers
execution_model = ChatOllama(model="llama3.2")
```

For the judge model, use one of two approaches:

**Option A: CLI shortcut** (simplest, sets judge globally):

```bash
deepeval set-ollama --model=llama3.2
```

Then all metrics automatically use Ollama as judge — no Python code needed.

**Option B: Custom wrapper** (fine-grained control per metric):

```python
from deepeval.models import DeepEvalBaseLLM
from langchain_ollama import ChatOllama

class OllamaJudge(DeepEvalBaseLLM):
    def __init__(self, model_name: str = "llama3.2"):
        self._model_name = model_name
        self._model = ChatOllama(model=model_name)

    def load_model(self):
        return self._model

    def generate(self, prompt: str) -> str:
        return self._model.invoke(prompt).content

    async def a_generate(self, prompt: str) -> str:
        res = await self._model.ainvoke(prompt)
        return res.content

    def get_model_name(self) -> str:
        return self._model_name

judge_model = OllamaJudge(model_name="llama3.2")
```

`ChatOllama` (from LangChain) is used for RAG answer generation.
The judge model (wrapper or CLI) is used by DeepEval metrics for evaluation.

---

## Building a RAG System with LangChain

```python
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_ollama import OllamaEmbeddings

def create_rag_system(chunk_size=1000, chunk_overlap=200, k=3):
    """Create a RAG retriever with configurable parameters."""
    loader = PyPDFLoader("./my_document.pdf")
    documents = loader.load()

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
    chunks = text_splitter.split_documents(documents)

    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    vectorstore = Chroma.from_documents(chunks, embeddings)
    retriever = vectorstore.as_retriever(search_kwargs={"k": k})
    return retriever, len(chunks)
```

**Parameters to tune later:**
- `chunk_size` — how big each text chunk is (characters)
- `chunk_overlap` — overlap between chunks (context continuity)
- `k` — how many chunks to retrieve per query

---

## End-to-End Test Function

```python
from deepeval.metrics import ContextualPrecisionMetric, FaithfulnessMetric
from deepeval.test_case import LLMTestCase
from deepeval import evaluate

def run_rag_test(retriever, question, expected_output):
    """Retrieve context, generate answer, evaluate with DeepEval."""
    # Step 1: Retrieve relevant chunks
    retrieved_docs = retriever.invoke(question)
    context = [doc.page_content for doc in retrieved_docs]

    # Step 2: Generate answer using execution model
    prompt = f"Based on this context: {context}\n\nQuestion: {question}"
    response = execution_model.invoke(prompt).content

    # Step 3: Create DeepEval test case
    test_case = LLMTestCase(
        input=question,
        actual_output=response,
        expected_output=expected_output,
        retrieval_context=context,
    )

    # Step 4: Evaluate with multiple metrics
    precision = ContextualPrecisionMetric(model=judge_model, verbose_mode=True)
    faithfulness = FaithfulnessMetric(model=judge_model, verbose_mode=True)
    results = evaluate(test_cases=[test_case], metrics=[precision, faithfulness])
    return results
```

### Interpreting Combined Scores

| Contextual Precision | Faithfulness | Meaning |
|---------------------|-------------|---------|
| High | High | Retriever finds right docs, LLM uses them correctly |
| High | Low | Right docs found, but LLM invents extra facts |
| Low | High | Wrong docs found, but LLM stays faithful to them |
| Low | Low | Wrong docs found AND LLM hallucinates |

---

## Running the Full Pipeline

```python
retriever, num_chunks = create_rag_system(
    chunk_size=1000, chunk_overlap=200, k=3,
)
print(f"Document split into {num_chunks} chunks")

results = run_rag_test(
    retriever=retriever,
    question="What energy source does the paper propose?",
    expected_output="The paper proposes matter/antimatter annihilation.",
)

# Access scores
metrics_data = results.test_results[0].metrics_data
for m in metrics_data:
    print(f"{m.name}: {m.score}")
```

---

## Execution vs Judge — When to Use What

| Role | Class | From | Purpose |
|------|-------|------|---------|
| Execution | `ChatOllama` | `langchain_ollama` | Answer generation (your RAG) |
| Judge | `OllamaJudge` wrapper | custom (see above) | DeepEval metric evaluation |
| Judge (alt) | CLI `deepeval set-ollama` | built-in | Global judge (no code) |

You can use different models for each role:

```python
# Small, fast model for generation
execution_model = ChatOllama(model="phi3")

# Larger, smarter model for evaluation
judge_model = OllamaJudge(model_name="llama3.2")
```

This **execution vs judge separation** is a best practice: the judge
should be equal or stronger than the model being tested.

---

## Dependencies

```bash
uv add deepeval langchain-community langchain-ollama chromadb pypdf
```

Ollama must be running locally: `ollama serve`

Pre-pull models:
```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

---

## Debugging: View Retrieved Chunks

Always check what your retriever actually returns. Scores alone
do not tell the full story — you need to see the raw text:

```python
retrieved_docs = retriever.invoke(question)
for i, doc in enumerate(retrieved_docs, 1):
    print(f"--- Chunk {i} ---")
    print(doc.page_content[:200])  # first 200 chars
    print()
```

If the chunks are about the wrong topic, no metric tuning will help.
Fix the retrieval first.

---

## Key Takeaway

This practical workflow shows how to go from **document → RAG pipeline
→ DeepEval evaluation** entirely locally with Ollama. No OpenAI API key
needed. See Part 15 for how to iterate and diagnose retrieval failures.

### Sources

- [Evaluation and DeepEval](https://testerstories.com/2026/02/ai-and-testing-evaluation-and-deepeval/)
- [Answer Relevancy](https://testerstories.com/2026/02/ai-and-testing-answer-relevancy/)
- [Faithfulness](https://testerstories.com/2026/02/ai-and-testing-faithfulness/)
- [Contextual Precision](https://testerstories.com/2026/02/ai-and-testing-contextual-precision/)
