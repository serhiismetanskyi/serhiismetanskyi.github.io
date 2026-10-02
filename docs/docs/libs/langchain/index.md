---
date: 2026-09-14
tags:
  - python
  - libraries
  - langchain
  - llm
---

# LangChain — LLM Application Framework

Framework for building applications powered by large language models. Composable components for prompts, chains, agents, RAG, and memory — unified via the Runnable interface and LCEL (LangChain Expression Language).

## Installation

```bash
uv add langchain langchain-core langchain-community
uv add langchain-openai          # OpenAI models
uv add langchain-anthropic       # Anthropic Claude models
uv add langchain-chroma          # ChromaDB vector store
uv add langchain-text-splitters  # document chunking
uv add langgraph                 # graph-based agent orchestration
uv add langsmith                 # observability and tracing
uv add langgraph-checkpoint-sqlite   # local graph persistence
uv add langgraph-checkpoint-postgres # production persistence
```

## When to Use What

| Component | Best for |
|-----------|----------|
| [`ChatPromptTemplate`](01-models-prompts-parsers.md) | Structuring LLM input with variables and roles |
| [LCEL chains](02-lcel-chains.md) (<code>&#124;</code>) | Linear pipelines: prompt → model → parser |
| [`StrOutputParser`](01-models-prompts-parsers.md) | Extracting plain text from model responses |
| [RAG retrieval chain](03-rag-retrieval.md) | Grounding answers in custom documents |
| [Agents + Tools](04-agents-tools.md) | Dynamic multi-step reasoning, API calls |
| [`ConversationBufferMemory`](05-memory-state.md) | Short conversation history |
| [LangGraph `StateGraph`](../langgraph/index.md) | Complex agents with loops, branching, human-in-the-loop |

## Section Map

| File | Topics |
|------|--------|
| [01 Models, Prompts & Parsers](./01-models-prompts-parsers.md) | Chat models, prompt templates, output parsers, streaming |
| [02 LCEL & Chains](./02-lcel-chains.md) | Runnable interface, pipe operator, parallel, branching, fallbacks |
| [03 RAG & Retrieval](./03-rag-retrieval.md) | Document loaders, text splitters, embeddings, vector stores, retrievers |
| [04 Agents & Tools](./04-agents-tools.md) | Tool creation, agent types, ReAct, tool calling, structured output |
| [05 Memory & State](./05-memory-state.md) | Conversation memory, summary memory, vector memory, message history |
| [06 LangGraph & Production](./06-langgraph-production.md) | StateGraph, nodes/edges, checkpointing, LangSmith, deployment |
| [07 Security, Evaluation & Operations](./07-security-evaluation-operations.md) | Tool safety, prompt injection controls, evaluation datasets, caching, CI gates |
| [08 Practical Playbooks](./08-practical-playbooks.md) | Ready scenarios: Q&A bot, RAG docs bot, agent with 2 tools |

## Quick Start

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("human", "{question}"),
])
model = ChatOpenAI(model="gpt-4o-mini", temperature=0)
parser = StrOutputParser()

chain = prompt | model | parser

response = chain.invoke({"question": "What is LangChain?"})
print(response)
```

## Core Ecosystem

| Package | Purpose |
|---------|---------|
| `langchain-core` | Base abstractions: Runnables, prompts, parsers, messages |
| `langchain` | Higher-level chains, agents, retrieval logic |
| `langchain-community` | Third-party integrations (vector stores, loaders) |
| `langchain-openai` | OpenAI chat models and embeddings |
| `langchain-anthropic` | Anthropic Claude models |
| `langgraph` | Graph-based agent orchestration with state |
| `langsmith` | Tracing, evaluation, monitoring |

## Quick Rules

1. **Use LCEL** — pipe operator `|` replaces all legacy chain classes.
2. **Every component is a Runnable** — `.invoke()`, `.stream()`, `.batch()` everywhere.
3. **Separate prompt from model** — compose via LCEL, not string formatting.
4. **Use structured output** — `model.with_structured_output(Schema)` for typed responses.
5. **RAG over fine-tuning** — ground answers in documents before training custom models.
6. **LangGraph for agents** — use `StateGraph` when you need loops, branching, or persistence.
7. **Trace everything** — enable LangSmith in production for debugging and cost tracking.
8. **Protect tools and prompts** — apply allowlists, schema validation, and injection defenses.
9. **Run evals in CI** — use LangSmith datasets and evaluator gates for regression control.

---

## Start Here (Beginner Learning Path)

If you are new to LangChain, follow this exact order:

1. Read [Models, Prompts & Parsers](01-models-prompts-parsers.md) and run the first chain.
2. Read [LCEL & Chains](02-lcel-chains.md) to learn composition (`|`, parallel, branch).
3. Read [RAG & Retrieval](03-rag-retrieval.md) and build a small local RAG on 10-50 docs.
4. Read [Agents & Tools](04-agents-tools.md) only after chains and RAG are clear.
5. Read [Memory & State](05-memory-state.md) to add chat continuity.
6. Read [LangGraph & Production](06-langgraph-production.md) when you need loops, approvals, persistence.
7. Read [Security, Evaluation & Operations](07-security-evaluation-operations.md) before shipping to users.

## What Is "Enough" to Start Real Work

You can start building useful internal assistants when you can:

- compose `prompt | model | parser`;
- retrieve top-k documents and cite sources;
- define 1-3 safe tools with `args_schema`;
- add retries, timeouts, and tracing;
- run at least one evaluation dataset before release.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
- [Test Automation Framework](../../test-automation-framework/index.md)
- [CI/CD](../../ci-cd-approaches/index.md)
- [Tools — Practical Reference Guides](../../tools/index.md)
- [Python Libraries](../index.md)
- [LangGraph — Stateful Agent Orchestration](../langgraph/index.md)
- [Agno — Agents, Teams & Workflows in Python](../agno/index.md)
