---
date: 2026-09-15
tags:
  - python
  - libraries
  - langchain
  - llm
  - rag
  - evaluation
---

# LangChain — RAG & Retrieval

## RAG Pipeline Overview

Retrieval-Augmented Generation grounds LLM responses in external documents. Two phases:

**Indexing (offline):** Load → Split → Embed → Store

**Query (runtime):** Embed question → Retrieve similar chunks → Generate answer

---

## Document Loaders

```python
from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    UnstructuredMarkdownLoader,
    WebBaseLoader,
)

pdf_docs = PyPDFLoader("report.pdf").load()
text_docs = TextLoader("notes.txt").load()
md_docs = UnstructuredMarkdownLoader("guide.md").load()
web_docs = WebBaseLoader("https://example.com/article").load()
```

| Loader | Source | Notes |
|--------|--------|-------|
| `TextLoader` | `.txt` files | Simplest loader |
| `PyPDFLoader` | PDF files | One `Document` per page |
| `UnstructuredMarkdownLoader` | Markdown files | Preserves structure |
| `WebBaseLoader` | Web pages | Uses `requests` + `BeautifulSoup` |
| `CSVLoader` | CSV files | One `Document` per row |
| `DirectoryLoader` | Folder | Glob pattern for batch loading |

Each loader returns a list of `Document(page_content=str, metadata=dict)`.

---

## Text Splitters

Chunking strategy is the single most impactful decision for retrieval quality.

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", ". ", " ", ""],
)

chunks = splitter.split_documents(pdf_docs)
```

| Splitter | Best for |
|----------|----------|
| `RecursiveCharacterTextSplitter` | General-purpose (default choice) |
| `MarkdownHeaderTextSplitter` | Markdown with section structure |
| `HTMLSectionSplitter` | HTML documents |
| `TokenTextSplitter` | Token-based for precise token budgets |
| `SemanticChunker` | Embedding-based semantic boundaries |

### Chunk Size Guidelines

| Content type | `chunk_size` | `chunk_overlap` |
|-------------|-------------|----------------|
| Technical docs | 800–1200 | 150–200 |
| Code | 500–800 | 100 |
| Conversational text | 300–500 | 50 |
| Legal / dense text | 1000–1500 | 200–300 |

---

## Embeddings

```python
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

vector = embeddings.embed_query("What is RAG?")
vectors = embeddings.embed_documents(["doc one", "doc two"])
```

| Provider | Model | Dimensions |
|----------|-------|-----------|
| OpenAI | `text-embedding-3-small` | 1536 |
| OpenAI | `text-embedding-3-large` | 3072 |
| HuggingFace | `sentence-transformers/all-MiniLM-L6-v2` | 384 |

---

## Vector Stores

### ChromaDB (prototyping)

```python
from langchain_chroma import Chroma

vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db",
    collection_name="my_docs",
)

results = vectorstore.similarity_search("deployment strategies", k=4)
```

### FAISS (local, fast)

```python
from langchain_community.vectorstores import FAISS

vectorstore = FAISS.from_documents(chunks, embeddings)
vectorstore.save_local("faiss_index")

loaded = FAISS.load_local("faiss_index", embeddings, allow_dangerous_deserialization=True)
```

### pgvector (production with PostgreSQL)

```python
from langchain_community.vectorstores import PGVector

vectorstore = PGVector.from_documents(
    documents=chunks,
    embedding=embeddings,
    connection_string="postgresql://user:pass@localhost:5432/vectordb",
    collection_name="documents",
)
```

| Store | Use case | Persistence |
|-------|----------|-------------|
| ChromaDB | Prototyping, small datasets | File-based |
| FAISS | Local search, fast similarity | File-based |
| pgvector | Production, existing PostgreSQL | Database |
| Qdrant | Production, scalable cloud | Server/cloud |
| Milvus | Large-scale enterprise | Server/cloud |

### Operational Vector DB Comparison

| Store | Best fit | Strength | Trade-off |
|------|----------|----------|-----------|
| FAISS | Local prototypes | Fast local ANN | Manual persistence/ops |
| Chroma | Small-medium local RAG | Simple Python integration | Limited cloud-grade ops |
| pgvector | Teams on PostgreSQL | Unified infra stack | Requires index tuning at scale |
| Qdrant | Production semantic search | Strong filtering + performance | Extra service to operate |
| Weaviate | Hybrid/search-rich cases | Rich retrieval features | Higher platform complexity |
| Milvus | Very large vector scale | Distributed architecture | Operational overhead |
| Pinecone | Managed SaaS vector DB | Minimal ops burden | Vendor cost model |

---

## Retrievers

```python
retriever = vectorstore.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 4},
)

docs = retriever.invoke("What is microservices architecture?")
```

| Search type | Behavior |
|-------------|----------|
| `"similarity"` | Top-k by cosine similarity (default) |
| `"mmr"` | Maximal Marginal Relevance — balances relevance with diversity |
| `"similarity_score_threshold"` | Only return docs above a score threshold |

---

## RAG Chain

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI

prompt = ChatPromptTemplate.from_messages([
    ("system", "Answer based on context only.\n\nContext:\n{context}"),
    ("human", "{question}"),
])

model = ChatOpenAI(model="gpt-4o-mini", temperature=0)


def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)


rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | model
    | StrOutputParser()
)

answer = rag_chain.invoke("How do I deploy to Kubernetes?")
```

### RAG with Sources

```python
from langchain_core.runnables import RunnableParallel

rag_with_sources = RunnableParallel(
    answer=rag_chain,
    sources=retriever,
)

result = rag_with_sources.invoke("deployment strategy")
print(result["answer"])
for doc in result["sources"]:
    print(doc.metadata["source"])
```

---

## Advanced Retrieval

### Multi-Query Retriever

Generates multiple query variations to improve recall.

```python
from langchain.retrievers.multi_query import MultiQueryRetriever

multi_retriever = MultiQueryRetriever.from_llm(
    retriever=vectorstore.as_retriever(),
    llm=ChatOpenAI(model="gpt-4o-mini", temperature=0),
)
```

### Contextual Compression

Re-ranks and filters retrieved documents for relevance.

```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainExtractor

compressor = LLMChainExtractor.from_llm(llm)
compression_retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=retriever,
)
```

### Full Example with Explicit LLM

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
compressor = LLMChainExtractor.from_llm(llm)
compression_retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=retriever,
)
```

---

## Hybrid Search and Re-Ranking (Recommended)

For production RAG, combine lexical + semantic retrieval and re-rank top candidates.

| Stage | Goal |
|-------|------|
| Hybrid retrieval | Improve recall on keywords and semantics |
| Re-ranking | Improve precision for final context |
| Citation output | Make answers auditable |

Always return source metadata (`source`, `page`, `chunk_id`) in final responses.

---

## Plain-Language Summary

RAG is a two-system workflow:

1. **Search system** finds relevant text chunks.
2. **Generation system** answers using only those chunks.

If your RAG is weak, usually the issue is chunking/retrieval quality, not the LLM itself.

## Minimum RAG That Works in Practice

Start with this baseline:

- `RecursiveCharacterTextSplitter` with chunk size 800-1200;
- `k=4` to `k=8` retrieval;
- strong system prompt: "Answer only from context";
- source citations in every answer;
- one eval set with good/edge queries.

## RAG Debug Checklist

When answer quality is poor, check in this order:

1. Were correct chunks retrieved?
2. Is chunk text clean (no boilerplate noise)?
3. Is the prompt forcing grounded answers?
4. Is context too long or too short?
5. Are citations pointing to the real supporting chunks?
