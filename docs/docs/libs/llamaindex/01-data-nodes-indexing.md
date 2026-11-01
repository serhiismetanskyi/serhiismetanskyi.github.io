---
date: 2026-10-25 12:00:00
tags:
  - python
  - libraries
  - llamaindex
  - rag
  - ai-agents
  - llm
---

# LlamaIndex — Data, Nodes & Indexing

Indexing turns files into searchable chunks. Every later quality problem (wrong answers, missing facts, leaked paths in prompts) usually traces back to a choice made here: how documents are read, what metadata they carry, how they are chunked and which embedding model is used.

| Stage | Object | Output |
|-------|--------|--------|
| Load | `SimpleDirectoryReader`, LlamaHub readers | `list[Document]` |
| Chunk | `SentenceSplitter`, `MarkdownNodeParser`, ... | `list[TextNode]` |
| Enrich (optional) | extractors (`TitleExtractor`, `KeywordExtractor`, `SummaryExtractor`, `QuestionsAnsweredExtractor`) | metadata on nodes (LLM calls) |
| Embed | `BaseEmbedding` subclass | `node.embedding` |
| Store | `VectorStoreIndex` + vector store | persisted vectors |
| Orchestrate | `IngestionPipeline` | the stages above, with cache and dedup |

## Documents and Readers

```python
from pathlib import Path

from llama_index.core import Document, SimpleDirectoryReader

documents = SimpleDirectoryReader(
    input_dir="data",
    recursive=True,                              # default False: only the top folder
    required_exts=[".md", ".txt"],
    exclude=["**/drafts/*"],
    filename_as_id=True,                         # doc_id = file path instead of a random UUID
    file_metadata=lambda path: {"file_name": Path(path).name, "source": "kb"},
).load_data()

for doc in documents:                            # portable ids: the default path is absolute
    doc.doc_id = doc.metadata["file_name"]

manual = Document(text="Refunds within 30 days.", doc_id="refund-policy", metadata={"topic": "billing"})
```

| `SimpleDirectoryReader` option | Meaning |
|--------------------------------|---------|
| `input_dir` / `input_files` | A folder, or an explicit list of files |
| `recursive`, `exclude`, `exclude_hidden`, `required_exts`, `num_files_limit` | File selection (`recursive=False`, `exclude_hidden=True` by default) |
| `file_metadata` | `path -> dict`; **replaces** the default metadata completely |
| `filename_as_id` | Stable `doc_id` from the path |
| `file_extractor` | `{".pdf": MyReader()}` overrides per extension |
| `errors="ignore"`, `encoding` | How text files are decoded |
| `raise_on_error=False` | A reader that fails is skipped unless you set `True` |

Plain text and Markdown are read by core. **PDF, DOCX, PPTX, CSV, XLSX, EPUB, images and audio need `llama-index-readers-file`.** Without it a `.pdf` is silently read as raw text (the file's bytes decoded as characters), so check `documents[0].text` after the first load.

LlamaHub (llamahub.ai) lists community readers: web pages, databases, Notion, Google Drive, Slack, and more. Each is its own package named `llama-index-readers-<name>` and imported from `llama_index.readers.<name>`; every reader has `load_data()` and returns `Document` objects. `llama-index-readers-file` ships `PDFReader`, `DocxReader`, `PandasCSVReader` and others for direct use.

## Metadata and What the Model Sees

Each `Document` and node has `metadata`. It is used three ways: **filters** at query time, **display** (citations), and **text** that is prepended to the chunk before embedding and before prompting the LLM.

| `MetadataMode` | Text returned by `get_content(metadata_mode=...)` |
|----------------|--------------------------------------------------|
| `NONE` | Body only |
| `EMBED` | Body plus metadata except `excluded_embed_metadata_keys` (sent to the embedding model) |
| `LLM` | Body plus metadata except `excluded_llm_metadata_keys` (sent in the synthesizer prompt) |
| `ALL` | Body plus all metadata |

```python
from llama_index.core.schema import MetadataMode

doc = Document(
    text="body",
    doc_id="x",
    metadata={"topic": "billing", "visibility": "public", "year": 2026},
    excluded_embed_metadata_keys=["year"],
    excluded_llm_metadata_keys=["year", "visibility"],
)
doc.get_content(metadata_mode=MetadataMode.EMBED)   # 'topic: billing\nvisibility: public\n\nbody'
doc.get_content(metadata_mode=MetadataMode.LLM)     # 'topic: billing\n\nbody'
```

`SimpleDirectoryReader` marks `file_name`, `file_type`, `file_size` and the dates as excluded, but **`file_path` is not excluded**: the absolute path of the file on your server is embedded and shown to the LLM. Override `file_metadata`, or set the exclusion lists, to keep paths and internal fields out of prompts. Metadata also counts toward the chunk size, so long metadata shrinks the usable text.

## Node Parsers

A node parser splits `Document` objects into nodes and copies the metadata. Each node keeps `ref_doc_id` (its document) and `PREVIOUS` / `NEXT` relationships.

| Parser | Splits by | Use for |
|--------|-----------|---------|
| `SentenceSplitter` | Sentences within `chunk_size` tokens (default parser) | General prose |
| `TokenTextSplitter` | Raw token windows, backup separators | Strict token budgets |
| `MarkdownNodeParser` | Headers; adds `header_path` metadata | Docs, READMEs, wikis |
| `HTMLNodeParser`, `JSONNodeParser`, `CodeSplitter` | Tags, JSON structure, syntax | Their formats |
| `SemanticSplitterNodeParser` | Embedding distance between sentences | Topic-shifting text; costs embeddings at ingest |
| `SentenceWindowNodeParser` | One sentence per node, neighbours in metadata | Window retrieval ([02](./02-retrieval-query-engines.md)) |
| `HierarchicalNodeParser` | Several chunk sizes with parent links | Auto-merging retrieval ([02](./02-retrieval-query-engines.md)) |
| `MarkdownElementNodeParser`, `UnstructuredElementNodeParser` | Tables and text elements (LLM summaries of tables) | Table-heavy documents |

```python
from llama_index.core.node_parser import MarkdownNodeParser, SemanticSplitterNodeParser, SentenceSplitter

splitter = SentenceSplitter(
    chunk_size=512,                  # tokens; default 1024
    chunk_overlap=64,                # default 200, and it must be smaller than chunk_size
    id_func=lambda i, doc: f"{doc.doc_id}#{i}",     # deterministic node ids
)
nodes = splitter.get_nodes_from_documents(documents)

md_nodes = MarkdownNodeParser().get_nodes_from_documents(documents)     # metadata["header_path"] == "/Refund policy/"
semantic = SemanticSplitterNodeParser(
    buffer_size=1, breakpoint_percentile_threshold=95, embed_model=my_embed_model
)
```

- Node ids are random UUIDs unless you pass `id_func`; stable ids make tests and re-ingestion predictable ([05](./05-testing-production.md)).
- `SentenceSplitter(chunk_size=64)` raises `ValueError: Got a larger chunk overlap (200) than chunk size (64)` because the overlap default stays 200. Set both.
- A warning `Metadata length (N) is close to chunk size` means metadata eats the chunk budget.
- `SentenceSplitter` uses NLTK data (`punkt_tab`, `stopwords`). It is downloaded to a cache folder on first use; in an offline or locked-down CI image, provide the data and point `NLTK_DATA` at it.

## `Settings`

`Settings` holds process-wide defaults. Anything you pass explicitly to a component wins.

| Attribute | Default | Notes |
|-----------|---------|-------|
| `Settings.llm` | OpenAI via `llama-index-llms-openai`, created lazily on first use | Raises `ValueError` without `OPENAI_API_KEY`. `Settings.llm = None` selects `MockLLM` |
| `Settings.embed_model` | `OpenAIEmbedding`, created lazily | `Settings.embed_model = None` selects `MockEmbedding` (constant vectors). `"local:BAAI/bge-small-en-v1.5"` selects a HuggingFace model |
| `Settings.chunk_size`, `Settings.chunk_overlap` | 1024, 200 | Setters update `Settings.node_parser` |
| `Settings.node_parser` / `Settings.transformations` | `SentenceSplitter` | Used by `from_documents` |
| `Settings.context_window`, `Settings.num_output` | 3900, 256 | Used when sizing prompts |
| `Settings.callback_manager` | empty | Legacy callbacks ([04](./04-evaluation-observability.md)) |

```python
from llama_index.core import Settings
from llama_index.core.node_parser import SentenceSplitter
from llama_index.llms.openai import OpenAI

Settings.llm = OpenAI(model="gpt-4o-mini", temperature=0)
Settings.embed_model = "local:BAAI/bge-small-en-v1.5"        # needs llama-index-embeddings-huggingface
Settings.node_parser = SentenceSplitter(chunk_size=512, chunk_overlap=64)
```

Global state is convenient in scripts and risky in services and tests. Libraries should accept `llm` and `embed_model` arguments and pass them down: `VectorStoreIndex.from_documents(docs, embed_model=..., transformations=[...])`, `index.as_query_engine(llm=...)`.

## Embeddings

| Provider | Class (package) | Notes |
|----------|-----------------|-------|
| OpenAI | `OpenAIEmbedding(model="text-embedding-3-small")` (`llama-index-embeddings-openai`) | The class default is `text-embedding-ada-002`; pass `model=` explicitly. `dimensions=` shortens v3 vectors |
| OpenAI-compatible server (vLLM, LiteLLM proxy, TEI, LM Studio) | `OpenAILikeEmbedding(model_name=..., api_base=..., api_key=...)` (`llama-index-embeddings-openai-like`) | `OpenAIEmbedding` rejects model names it does not know |
| Local | `HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")` (`llama-index-embeddings-huggingface`) | Downloads weights from the Hub, runs on CPU or GPU; pulls in `torch` |
| Ollama | `OllamaEmbedding(model_name="nomic-embed-text", base_url="http://localhost:11434")` (`llama-index-embeddings-ollama`) | See [Ollama](../../tools/ollama/index.md) |
| Custom | subclass `BaseEmbedding`: `_get_text_embedding`, `_get_query_embedding`, `_aget_query_embedding` | Tests, proprietary APIs |

Common options: `embed_batch_size` (texts per request), `num_workers` (parallel async batches), `rate_limiter` ([05](./05-testing-production.md)). Some models want instructions: `HuggingFaceEmbedding(query_instruction=..., text_instruction=...)`.

**Index and query must use the same model.** Changing the model, the dimension or the instruction prefixes means re-embedding everything.

## `IngestionPipeline`

`VectorStoreIndex.from_documents` runs transformations once. `IngestionPipeline` is the repeatable version: transformations in order, an optional **cache** (skip a transformation whose input hash is unchanged), a **docstore** (skip documents already seen) and an optional **vector store** to write into.

```python
from llama_index.core import Document
from llama_index.core.ingestion import DocstoreStrategy, IngestionCache, IngestionPipeline
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.storage.docstore import SimpleDocumentStore
from llama_index.core.vector_stores import SimpleVectorStore

store = SimpleVectorStore()
pipeline = IngestionPipeline(
    transformations=[SentenceSplitter(chunk_size=256, chunk_overlap=32), embed_model],   # last step embeds
    docstore=SimpleDocumentStore(),
    vector_store=store,
    cache=IngestionCache(),
    docstore_strategy=DocstoreStrategy.UPSERTS,
)

nodes = pipeline.run(documents=docs)            # new nodes; embedded and written to the vector store
nodes = pipeline.run(documents=docs)            # [] : nothing changed
pipeline.persist("./pipeline_storage")          # cache + docstore
pipeline.load("./pipeline_storage")             # later runs reuse them
nodes = await pipeline.arun(documents=docs, num_workers=4)   # async; num_workers sets processes
```

| `docstore_strategy` | Document unchanged | Document changed (same `doc_id`) | Document missing from this run |
|---------------------|--------------------|----------------------------------|--------------------------------|
| `UPSERTS` (default) | skipped | old nodes removed from the vector store, new nodes added | kept |
| `DUPLICATES_ONLY` | skipped | new nodes added, **old nodes stay** (stale vectors) | kept |
| `UPSERTS_AND_DELETE` | skipped | replaced | document and nodes deleted |

Dedup needs a docstore **and** stable `doc_id`s: with random UUIDs every run looks like new documents. A cache saves the cost of embedding or LLM extractors; the docstore decides which documents run at all. Pass `nodes=` instead of `documents=` to feed already-parsed nodes.

## `VectorStoreIndex`

```python
from llama_index.core import VectorStoreIndex

index = VectorStoreIndex.from_documents(docs, embed_model=embed_model, transformations=[splitter], show_progress=True)
index = VectorStoreIndex(nodes, embed_model=embed_model)            # from nodes you built
index = VectorStoreIndex.from_vector_store(vector_store, embed_model=embed_model)   # attach to existing data
```

With the default in-memory `SimpleVectorStore`, the index keeps node text in a docstore next to the vectors. Remote stores (Chroma, Qdrant, Postgres) keep the text in the store, so `index.docstore` stays empty unless you pass `store_nodes_override=True`.

| Store | Package | Create |
|-------|---------|--------|
| `SimpleVectorStore` | core | default; `persist()` writes JSON files |
| Chroma | `llama-index-vector-stores-chroma` | `ChromaVectorStore(chroma_collection=client.get_or_create_collection("kb-docs"))` |
| Qdrant | `llama-index-vector-stores-qdrant` | `QdrantVectorStore(client=QdrantClient(url=...), collection_name="kb")` (`":memory:"` for tests) |
| PostgreSQL + pgvector | `llama-index-vector-stores-postgres` | `PGVectorStore.from_params(...)`; see [PostgreSQL](../../databases/postgresql/index.md) |

```python
import chromadb
from llama_index.core import StorageContext, VectorStoreIndex
from llama_index.vector_stores.chroma import ChromaVectorStore

client = chromadb.PersistentClient(path="chroma_db")
store = ChromaVectorStore(chroma_collection=client.get_or_create_collection("kb-docs"))   # name: 3+ chars
index = VectorStoreIndex.from_documents(
    docs, storage_context=StorageContext.from_defaults(vector_store=store), embed_model=embed_model
)

# later, in another process: no re-embedding
index = VectorStoreIndex.from_vector_store(
    ChromaVectorStore(chroma_collection=chromadb.PersistentClient(path="chroma_db").get_collection("kb-docs")),
    embed_model=embed_model,
)
```

```python
from llama_index.vector_stores.postgres import PGVectorStore

store = PGVectorStore.from_params(
    host="localhost", port=5432, database="kb", user="app", password="<DB_PASSWORD>",
    table_name="kb_chunks",          # created as "data_kb_chunks"
    embed_dim=1536,                  # must equal the embedding model's dimension (default 1536)
    hybrid_search=True,              # adds a full-text column for vector_store_query_mode="hybrid"
    hnsw_kwargs={"hnsw_m": 16, "hnsw_ef_construction": 64, "hnsw_ef_search": 40, "hnsw_dist_method": "vector_cosine_ops"},
)
```

`PGVectorStore` needs the `vector` extension (`CREATE EXTENSION vector`); the integration package installs the `psycopg2` and `asyncpg` drivers. Collection names have their own rules (Chroma: 3-512 characters from `[a-zA-Z0-9._-]`).

## `StorageContext`, Persist and Load

`StorageContext` bundles the docstore (documents and nodes), the index store (index structure) and one or more vector or graph stores.

```python
from llama_index.core import StorageContext, load_index_from_storage

index.storage_context.persist(persist_dir="storage")
# files: default__vector_store.json, docstore.json, index_store.json, graph_store.json, image__vector_store.json

storage = StorageContext.from_defaults(persist_dir="storage")
index = load_index_from_storage(storage, embed_model=embed_model)    # pass the same embed model for queries
```

The embedding model is **not** saved: pass it again (or set `Settings.embed_model`). For a real vector store, pass `StorageContext.from_defaults(vector_store=store)` and use `from_vector_store` as above.

## Updating an Index

| Operation | Call | Notes |
|-----------|------|-------|
| Add | `index.insert(Document(...))` or `index.insert_nodes(nodes)` | Chunks and embeds with the index's transformations |
| Delete | `index.delete_ref_doc("refund-policy", delete_from_docstore=True)` | Removes all nodes of that `doc_id` |
| Replace changed documents | `index.refresh_ref_docs(documents)` | Returns `list[bool]` in input order: `True` if inserted or re-embedded. Unchanged documents (same hash) return `False`; documents you do not pass are left alone |
| List | `index.ref_doc_info` | `{doc_id: RefDocInfo}` |
| Async | `ainsert`, `arefresh_ref_docs`, `adelete_ref_doc` | Same semantics |

`refresh_ref_docs` never deletes: removing a document needs an explicit `delete_ref_doc`, or an `IngestionPipeline` with `UPSERTS_AND_DELETE`. All of this depends on stable `doc_id`s.

## Other Indices

| Index | Idea | Typical use |
|-------|------|-------------|
| `SummaryIndex` (alias `ListIndex`) | Keeps all nodes; the query engine reads every node | Whole-document summaries, small corpora |
| `DocumentSummaryIndex` | An LLM summary per document, retrieval over summaries first | Choosing the right document before reading chunks |
| `KeywordTableIndex` (`SimpleKeywordTableIndex`, `RAKEKeywordTableIndex`) | Keyword to node table | Exact-term lookup without embeddings |
| `TreeIndex` | Hierarchy of LLM summaries | Top-down summarisation |
| `PropertyGraphIndex` | Entities and relations in a property graph store | Relationship questions; needs a graph store and extractors |

Vector search is the default for question answering. Reach for the others when the question is "summarise this" (summary), "find this exact term" (keyword) or "how are these related" (graph). A `SummaryIndex` query engine calls the LLM over every node, so its cost grows with corpus size.

## Common Mistakes

| Mistake | Effect | Fix |
|---------|--------|-----|
| Default chunking on short FAQ entries | Several answers merged into one chunk | Smaller `chunk_size`, or one node per entry via `Document` per entry |
| `file_path` left in metadata | Server paths in embeddings and prompts | `file_metadata=`, `excluded_embed_metadata_keys`, `excluded_llm_metadata_keys` |
| Random `doc_id`s with a docstore | Dedup never matches; duplicates pile up | `filename_as_id=True` or explicit ids |
| `DocstoreStrategy.DUPLICATES_ONLY` on edited files | Old and new chunks both answer queries | `UPSERTS` |
| `OpenAIEmbedding()` without `model=` | `text-embedding-ada-002` | Name the model |
| Query-time embed model differs from index-time | Meaningless scores | Same model; store its name with the index |
| PDF folder without `llama-index-readers-file` | Binary junk indexed as text | Install it; assert on a sample |
| `refresh_ref_docs` expected to delete | Removed files stay searchable | `delete_ref_doc` for removed ids |
| `PGVectorStore` `embed_dim` left at 1536 with another model | Insert or query error | Match the model's dimension |

---
## See also
- [LlamaIndex — RAG and Agents over Your Data](./index.md)
- [LlamaIndex — Retrieval & Query Engines](./02-retrieval-query-engines.md)
- [LangChain — RAG & Retrieval](../langchain/03-rag-retrieval.md)
- [PostgreSQL](../../databases/postgresql/index.md)
- [Ollama](../../tools/ollama/index.md)
- [Python Libraries](../index.md)
