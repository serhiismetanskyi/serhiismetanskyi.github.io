---
date: 2026-10-25 12:00:00
tags:
  - python
  - libraries
  - llamaindex
  - rag
  - ai-agents
  - llm
  - testing
---

# LlamaIndex — Testing & Production

A LlamaIndex app is deterministic code around two non-deterministic calls, embedding and LLM. Fake both and almost everything becomes an ordinary unit test: chunk ids, retrieved ids and scores, filters, prompts, tool calls, workflow paths. Answer quality is checked separately, with a real judge, on a small golden set ([04](./04-evaluation-observability.md)).

| Need | Use |
|------|-----|
| An LLM that stays in-process | `MockLLM()`: `complete()` returns **the prompt it received**, so tests can assert on the context. `MockLLM(max_tokens=5)` returns `text text text text text` |
| Scripted behaviour | Subclass `CustomLLM` (`metadata`, `complete`, `stream_complete`) |
| Scripted tool calls | `MockFunctionCallingLLM(response_generator=fn)`; `fn(messages, **kwargs)` returns a `ChatMessage` with text or `ToolCallBlock`s |
| Embeddings | `MockEmbedding(embed_dim=8)` returns one constant vector: fine for plumbing, useless for ranking. For ranking tests use a deterministic bag-of-words `BaseEmbedding` (below) |
| The real client over HTTP | A local OpenAI-compatible server; point `OpenAI(api_base=...)` or `OpenAILike(api_base=...)` at it |

Pass fakes explicitly (`embed_model=`, `llm=`) instead of mutating `Settings`, and delete `OPENAI_API_KEY` in an autouse fixture so a forgotten injection fails on the missing key instead of calling the API. `no_text` and `context_only` synthesizers still read `Settings.llm` when built ([02](./02-retrieval-query-engines.md)); give those tests a `MockLLM` as well.

Put the support modules (`kwembed.py`, `fake_openai.py`, `corpus.py`) at the project root and set `asyncio_mode = "auto"` and `pythonpath = ["."]` under `[tool.pytest.ini_options]`.

## Embeddings, Corpus and Fixtures

```python title="kwembed.py"
import hashlib
import math
import re

from llama_index.core.base.embeddings.base import BaseEmbedding


class KeywordEmbedding(BaseEmbedding):
    """Hashed bag of words: same text, same vector; shared words, higher cosine similarity."""

    dim: int = 128

    def _vec(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for token in re.findall(r"[a-z0-9]+", text.lower()):
            vec[int(hashlib.md5(token.encode()).hexdigest(), 16) % self.dim] += 1.0
        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [x / norm for x in vec]

    def _get_query_embedding(self, query: str) -> list[float]:
        return self._vec(query)

    async def _aget_query_embedding(self, query: str) -> list[float]:
        return self._vec(query)

    def _get_text_embedding(self, text: str) -> list[float]:
        return self._vec(text)
```

`corpus.py` builds `Document`s with stable `doc_id`s and the metadata your filters use, from tuples like:

```python title="corpus.py (excerpt)"
("ship-express", "Express shipping takes 1 to 2 business days and costs 15 USD.", "shipping", "public"),
("sec-incident", "Internal runbook: rotate API keys within one hour of a suspected leak.", "security", "internal"),
```

```python title="tests/conftest.py"
import pytest
from llama_index.core import VectorStoreIndex
from llama_index.core.llms import MockLLM
from llama_index.core.node_parser import SentenceSplitter

from corpus import make_docs
from kwembed import KeywordEmbedding


@pytest.fixture(autouse=True)
def no_real_provider(monkeypatch):
    """A test that forgets to inject a model fails on the missing key instead of calling OpenAI."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)


@pytest.fixture
def splitter():
    return SentenceSplitter(chunk_size=256, chunk_overlap=16, id_func=lambda i, doc: f"{doc.doc_id}#{i}")


@pytest.fixture
def index(splitter):
    return VectorStoreIndex.from_documents(make_docs(), embed_model=KeywordEmbedding(), transformations=[splitter])


@pytest.fixture
def llm():
    return MockLLM()                     # complete() returns the prompt it received
```

`id_func` turns random node ids into `ship-express#0`, so tests assert on ids. Each corpus document is shorter than the chunk size and becomes one node. Write queries that share words with their target: a bag-of-words embedding ranks by word overlap.

## Retrieval, Chunking and Prompt Tests

```python title="tests/test_retrieval.py"
import pytest
from llama_index.core import Document
from llama_index.core.vector_stores import FilterOperator, MetadataFilter, MetadataFilters


@pytest.mark.parametrize(
    ("query", "expected_id"),
    [
        ("express delivery takes 1 to 2 days", "ship-express#0"),
        ("digital goods refundable if download link never used", "refund-digital#0"),
        ("minimum password length", "sec-password#0"),
    ],
)
def test_top1_is_the_expected_chunk(index, query, expected_id):
    nodes = index.as_retriever(similarity_top_k=1).retrieve(query)
    assert [n.node_id for n in nodes] == [expected_id]
    assert nodes[0].score > 0.1


def test_acl_filter_never_leaks_internal_chunks(index):
    public = MetadataFilters(filters=[MetadataFilter(key="visibility", value="public", operator=FilterOperator.EQ)])
    nodes = index.as_retriever(similarity_top_k=5, filters=public).retrieve("rotate API keys after a leak")
    assert nodes and all(n.metadata["visibility"] == "public" for n in nodes)
    assert "sec-incident#0" not in {n.node_id for n in nodes}


def test_chunking_snapshot(splitter):
    text = " ".join(f"Sentence number {i} is here." for i in range(40))
    nodes = splitter.get_nodes_from_documents([Document(text=text, doc_id="doc")])
    assert [n.node_id for n in nodes] == ["doc#0", "doc#1"]
    assert nodes[0].text.startswith("Sentence number 0 is here.") and nodes[1].ref_doc_id == "doc"


def test_prompt_contains_retrieved_context(index, llm):
    response = index.as_query_engine(llm=llm, similarity_top_k=1).query("express delivery takes 1 to 2 days")
    assert "Express shipping takes 1 to 2 business days" in str(response)      # MockLLM echoes the prompt
    assert [n.node_id for n in response.source_nodes] == ["ship-express#0"]
```

Retrieved ids, a score floor and filters are exact assertions with no LLM and no flakiness; a filter test doubles as an access-control test. The chunking snapshot catches a splitter or `chunk_size` change that would silently re-chunk the corpus. With `MockLLM` the answer is the prompt, which proves what context and metadata reach the model.

## Agents and Workflows

```python title="tests/test_agent.py"
from llama_index.core.agent.workflow import FunctionAgent, ToolCallResult
from llama_index.core.base.llms.types import ChatMessage, MessageRole, ToolCallBlock
from llama_index.core.llms import MockFunctionCallingLLM
from llama_index.core.tools import QueryEngineTool


def scripted_llm(*steps):
    """Each step is ("tool_name", {kwargs}) or a final answer string, consumed one per LLM call."""
    queue = list(steps)

    def generator(messages, **kwargs):
        current = queue.pop(0)
        if isinstance(current, str):
            return ChatMessage(role=MessageRole.ASSISTANT, content=current)
        name, args = current
        call = ToolCallBlock(tool_call_id="call-1", tool_name=name, tool_kwargs=args)
        return ChatMessage(role=MessageRole.ASSISTANT, blocks=[call])

    return MockFunctionCallingLLM(response_generator=generator)


async def test_agent_calls_the_knowledge_base_tool(index, llm):
    kb = QueryEngineTool.from_defaults(index.as_query_engine(llm=llm, similarity_top_k=1), name="kb",
                                       description="Search the support knowledge base.")
    llm_script = scripted_llm(("kb", {"input": "express delivery takes 1 to 2 days"}), "Express takes 1 to 2 days.")
    handler = FunctionAgent(tools=[kb], llm=llm_script).run("How fast is express shipping?")
    results = [e async for e in handler.stream_events() if isinstance(e, ToolCallResult)]
    assert str(await handler) == "Express takes 1 to 2 days."
    assert [r.tool_name for r in results] == ["kb"]
    assert "Express shipping takes 1 to 2 business days" in results[0].tool_output.content
```

The scripted LLM replaces the model's decisions while the real tool, query engine and agent loop run. Assert on `ToolCallResult` and the final text, not on wording. A tool that raises shows up as `tool_output.is_error`; a script that never answers tests `max_iterations`.

```python title="tests/test_workflow.py"
from rag_flow import RAGWorkflow


async def test_workflow_paths_and_graph(index, llm):
    flow = RAGWorkflow(index, llm, timeout=10)
    response = await flow.run(query="express delivery takes 1 to 2 days")
    assert response.source_nodes[0].node_id == "ship-express#0"
    assert await flow.run(query="") == "Please ask a question."
    flow.validate()                                     # every event has a producer and a consumer
```

`RAGWorkflow` is the class from [03](./03-agents-tools-workflows.md). `validate()` catches an event without producer or consumer. To test the timeout, subclass the workflow, replace one step with `await asyncio.sleep(5)` and expect `WorkflowTimeoutError` from `run()` with `timeout=0.2`. `workflows.testing.WorkflowTestRunner(flow).run(start_event=StartEvent(query="..."))` collects streamed events.

## A Fake OpenAI-Compatible Server

The real `OpenAI` client (request building, SSE parsing, tool-call decoding) runs against a local server. `OpenAIEmbedding` and `OpenAILike` work the same way.

??? note "fake_openai.py"
    ```python
    import json
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    from kwembed import KeywordEmbedding

    EMBED = KeywordEmbedding(dim=64)


    class Handler(BaseHTTPRequestHandler):
        log_message = lambda self, *args: None

        def send_json(self, obj):
            raw = json.dumps(obj).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            self.server.requests.append({"path": self.path, "body": body})
            if self.path.endswith("/embeddings"):
                texts = body["input"] if isinstance(body["input"], list) else [body["input"]]
                data = [{"object": "embedding", "index": i, "embedding": EMBED.get_text_embedding(t)} for i, t in enumerate(texts)]
                return self.send_json({"object": "list", "data": data, "model": body["model"], "usage": {"prompt_tokens": 1, "total_tokens": 1}})
            script = self.server.script
            reply = script.pop(0) if script else "echo: " + (body["messages"][-1].get("content") or "")[-60:]
            call = None
            if isinstance(reply, dict):                      # {"tool": name, "args": {...}}
                call = {"id": "call_1", "type": "function", "function": {"name": reply["tool"], "arguments": json.dumps(reply["args"])}}
            finish = "tool_calls" if call else "stop"
            if not body.get("stream"):
                message = {"role": "assistant", "content": None if call else reply, "tool_calls": [call] if call else None}
                return self.send_json({"id": "c1", "object": "chat.completion", "model": body["model"],
                                       "choices": [{"index": 0, "message": message, "finish_reason": finish}],
                                       "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}})
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            deltas = [{"role": "assistant", "tool_calls": [{**call, "index": 0}]}] if call else [{"content": w + " "} for w in reply.split(" ")]
            for delta, reason in [(d, None) for d in deltas] + [({}, finish)]:
                chunk = {"id": "c1", "object": "chat.completion.chunk", "model": body["model"],
                         "choices": [{"index": 0, "delta": delta, "finish_reason": reason}]}
                self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
            self.wfile.write(b"data: [DONE]\n\n")


    class FakeOpenAI(ThreadingHTTPServer):
        """script: replies consumed in order, a str (text) or {"tool": name, "args": {...}}; empty script echoes."""

        def __init__(self, script=None):
            super().__init__(("127.0.0.1", 0), Handler)
            self.script, self.requests = list(script or []), []

        @property
        def base_url(self) -> str:
            return f"http://127.0.0.1:{self.server_address[1]}/v1"

        def __enter__(self):
            threading.Thread(target=self.serve_forever, daemon=True).start()
            return self

        def __exit__(self, *exc):
            self.shutdown()
            self.server_close()
    ```

```python title="tests/test_fake_server.py"
from llama_index.core.agent.workflow import FunctionAgent


async def test_tool_call_round_trip_over_http(openai_llm, fake_openai):
    def order_status(order_id: str) -> str:
        """Return the status of an order."""
        return "shipped"

    fake_openai.script[:] = [{"tool": "order_status", "args": {"order_id": "o1"}}, "Order o1 is shipped."]
    answer = await FunctionAgent(tools=[order_status], llm=openai_llm).run("Where is o1?")
    first, second = (r["body"] for r in fake_openai.requests)
    assert str(answer).strip() == "Order o1 is shipped."
    assert first["tools"][0]["function"]["name"] == "order_status"
    assert [m["content"] for m in second["messages"] if m["role"] == "tool"] == ["shipped"]
```

The fixtures behind it: `fake_openai` is `with FakeOpenAI() as server: yield server`, and `openai_llm` is `OpenAI(model="gpt-4o-mini", api_key="sk-test", api_base=fake_openai.base_url, max_retries=0)`. Replies are consumed **in order**. Concurrent callers (`BatchEvalRunner`, `num_workers`) consume them in arbitrary order, so for those pick the reply from the request content. Assert on `fake_openai.requests` for model, `stream`, `tools` and message roles.

## Golden-Set Gates

```python title="tests/test_golden.py"
from llama_index.core.evaluation import RetrieverEvaluator

GOLDEN = [  # (question, expected node ids): reviewed by a human, frozen in git
    ("express delivery takes 1 to 2 days", ["ship-express#0"]),
    ("standard shipping free for orders above 50 USD", ["ship-standard#0"]),
    ("digital goods refundable if download link never used", ["refund-digital#0"]),
    ("passwords must contain at least 12 characters", ["sec-password#0"]),
]


def test_retrieval_quality_gate(index):
    evaluator = RetrieverEvaluator.from_metric_names(["hit_rate", "mrr"], retriever=index.as_retriever(similarity_top_k=3))
    results = [evaluator.evaluate(query=q, expected_ids=ids) for q, ids in GOLDEN]
    for metric, floor in {"hit_rate": 0.95, "mrr": 0.9}.items():       # baseline 1.0 minus tolerance
        assert sum(r.metric_vals_dict[metric] for r in results) / len(results) >= floor, metric
```

Freeze the golden file in git, review it by hand, and set thresholds from a measured baseline minus a tolerance. Run judge-based evaluators in a separate, key-gated job:

```python
@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="real judge needs a key")
async def test_answers_are_faithful(real_query_engine, judge):
    runner = BatchEvalRunner({"faithfulness": FaithfulnessEvaluator(llm=judge)}, workers=4)
    results = await runner.aevaluate_queries(real_query_engine, queries=[q for q, _ in GOLDEN])
    assert sum(r.passing for r in results["faithfulness"]) / len(GOLDEN) >= 0.9
```

CI: unit and wire tests on every push (no keys, seconds); the retrieval gate on every push when embeddings are local, nightly when they are an API; judge evals nightly with keys from CI secrets and a question cap. Pin `uv.lock`; in images without internet pre-populate the NLTK data (`NLTK_DATA`).

## Production

| Topic | Practice |
|-------|----------|
| Async | In async servers use `aquery`, `achat`, `astream_chat`, `aretrieve`, `ainsert`, `pipeline.arun`, `await agent.run(...)`, `await workflow.run(...)`; a sync `query()` inside `async def` blocks the event loop |
| Persistence | A vector store or `storage_context.persist`; load once at startup. Store the embedding model name and dimension with the index |
| Re-indexing | Build into a new collection, run the golden gate, switch the name, keep the old one for rollback; incremental updates via `IngestionPipeline` ([01](./01-data-nodes-indexing.md)) |
| Caching | `IngestionCache` for ingestion; for answers cache in your service (key: normalised question + index version + prompt version) |
| State | One `Memory(session_id=...)` per user with `async_database_uri`, one `Context` per run ([03](./03-agents-tools-workflows.md)) |
| Limits | `rate_limiter=` and `max_retries`, `timeout` on the LLM and embedding objects, plus an `asyncio.Semaphore` around calls |

```python
from llama_index.core.rate_limiter import TokenBucketRateLimiter
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI

limiter = TokenBucketRateLimiter(requests_per_minute=300, tokens_per_minute=200_000)    # one shared budget
llm = OpenAI(model="gpt-4o-mini", rate_limiter=limiter, max_retries=3, timeout=30)
embed = OpenAIEmbedding(model="text-embedding-3-small", rate_limiter=limiter, embed_batch_size=100, num_workers=4)
```

Each process has its own bucket: divide the provider limit by the number of workers, or use a gateway such as [LiteLLM](../litellm/index.md).

### Serving behind FastAPI

```python title="app.py (excerpt)"
def filters_for(role: str) -> MetadataFilters | None:
    """Built from the caller's identity, never from the request body."""
    if role == "staff":
        return None
    return MetadataFilters(filters=[MetadataFilter(key="visibility", value="public", operator=FilterOperator.EQ)])


@app.post("/ask")
async def ask(question: str, role: str = Depends(current_role)) -> dict:     # current_role: your auth dependency
    engine = index.as_query_engine(llm=llm, similarity_top_k=4, filters=filters_for(role))
    response = await engine.aquery(question)
    return {"answer": str(response), "sources": [{"node_id": n.node_id, "score": n.score} for n in response.source_nodes]}
```

Load the index once (for example in a `lifespan` handler), build the engine per request so it carries that caller's filters, and test with `TestClient` plus `app.dependency_overrides[current_role]` and the fakes above (one test asks as `customer` and as `staff` and compares the returned `node_id`s). For streaming, build the engine with `streaming=True`, `await engine.aquery(q)` and return `response.async_response_gen()` in a `StreamingResponse`. More in [FastAPI](../fastapi/index.md).

## Security

| Risk | Control |
|------|---------|
| Prompt injection through retrieved documents | Treat chunks as data; least-privilege tools; human approval for side effects ([03](./03-agents-tools-workflows.md)); never let retrieved text choose a tool argument unchecked |
| Users reading documents they must not see | `MetadataFilters` built server-side from the authenticated identity, ACL tags on every node at ingest, a leak test (above); a collection or database per tenant for hard isolation |
| PII in documents, prompts, traces | Redact at ingest or with `PIINodePostprocessor`; mask in the exporter ([04](./04-evaluation-observability.md)); do not log `source_nodes` text wholesale |
| Internal metadata exposed | `file_path` and other keys reach prompts and API responses unless excluded ([01](./01-data-nodes-indexing.md)) |
| Cost and denial of wallet | Rate limiter, `max_iterations`, workflow `timeout`, per-user quotas |
| Untrusted model code | `SentenceTransformerRerank` and `HuggingFaceEmbedding` download from the Hub: pin revisions, review before `trust_remote_code=True` |

Background: [OWASP LLM Security](../../owasp-llm-security/index.md); validators: [Guardrails AI](../guardrails/index.md).

## Versioning the Sub-Packages

An install is `llama-index-core` plus many independently versioned packages, and core still ships breaking changes in 0.x minors. An integration pinned to an old core downgrades it: `llama-index-question-gen-openai` 0.3.1 requires `llama-index-core<0.13`.

Commit `uv.lock` and upgrade in its own PR that runs the full suite and the golden gate. Read the [CHANGELOG](https://github.com/run-llama/llama_index/blob/main/CHANGELOG.md) for core and each integration. After `uv add`, confirm `llama-index-core` did not move (`uv pip list | grep llama-index`). Prefer `llama-index-core` plus provider packages over the `llama-index` bundle, which pins older OpenAI integration ranges, and keep LlamaIndex behind a small module (`build_index`, `build_engine`) so an API change touches one file.

## Out of Scope: Hosted Products

LlamaParse and LlamaCloud are commercial hosted services from the LlamaIndex company (document parsing, managed indexes). This guide covers the open-source framework, which does not need them. They have their own API keys, pricing and data-handling terms; evaluate them like any external processor of your documents.

---
## See also
- [LlamaIndex — RAG and Agents over Your Data](./index.md)
- [LlamaIndex — Evaluation & Observability](./04-evaluation-observability.md)
- [pytest](../pytest/index.md)
- [FastAPI](../fastapi/index.md)
- [Ragas — Testing & CI](../ragas/05-testing-ci.md)
- [Pydantic AI — Testing, Evals & Observability](../pydantic-ai/04-testing-evals.md)
- [promptfoo — LLM Evals & Red Teaming from YAML](../../tools/promptfoo/index.md)
- [OWASP LLM Security](../../owasp-llm-security/index.md)
- [Guardrails AI](../guardrails/index.md)
- [LiteLLM — One API for 100+ LLM Providers](../litellm/index.md)
