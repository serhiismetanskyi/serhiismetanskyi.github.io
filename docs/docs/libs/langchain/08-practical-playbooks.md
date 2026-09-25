---
date: 2026-09-16
tags:
  - python
  - libraries
  - langchain
  - llm
---

# LangChain — Practical Playbooks

Three ready-to-use scenarios for fast start: simple Q&A bot, documentation RAG bot, and agent with two tools.

## Playbook 1: Q&A Bot (No RAG, No Tools)

### When to use

- Internal helper bot with general answers.
- Fast prototype in 15-30 minutes.
- You do not need custom knowledge base yet.

### Minimal setup

```bash
uv add langchain langchain-core langchain-openai
```

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a concise technical assistant."),
    ("human", "{question}"),
])

chain = (
    prompt
    | ChatOpenAI(model="gpt-4o-mini", temperature=0, timeout=30, max_retries=2)
    | StrOutputParser()
)

print(chain.invoke({"question": "What is HTTP caching?"}))
```

### Production baseline

1. `temperature=0` for predictable answers.
2. Set timeout and retries.
3. Add tracing tags and run metadata.
4. Add output schema if your UI/API depends on fields.

## Playbook 2: RAG Bot for Documentation

### When to use

- Team knowledge base (runbooks, docs, ADRs).
- Need grounded answers with citations.
- Need lower hallucination risk than plain chatbot.

### Minimal setup

```bash
uv add langchain langchain-core langchain-openai langchain-community
uv add langchain-text-splitters langchain-chroma
```

```python
from langchain_chroma import Chroma
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

docs = DirectoryLoader("docs", glob="**/*.md", loader_cls=TextLoader).load()
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_documents(docs)

vs = Chroma.from_documents(
    documents=chunks,
    embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
    collection_name="project_docs",
    persist_directory="./chroma_docs",
)
retriever = vs.as_retriever(search_kwargs={"k": 5})

prompt = ChatPromptTemplate.from_messages([
    ("system", "Answer only from provided context. If missing, say you do not know.\n\nContext:\n{context}"),
    ("human", "{question}"),
])

def format_docs(items):
    return "\n\n".join(d.page_content for d in items)

rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | ChatOpenAI(model="gpt-4o-mini", temperature=0)
    | StrOutputParser()
)

print(rag_chain.invoke("How to run deployment?"))
```

### Must-have quality checks

1. Verify retrieved chunks before tuning model.
2. Return citations (`source`, `page`, `chunk_id`).
3. Add 20-50 real queries for offline evaluation.
4. Add prompt-injection guard: retrieved text is untrusted.

## Playbook 3: Agent with 2 Tools

### When to use

- Model must choose tools dynamically.
- Workflow is not fully predictable.
- You need reasoning + acting loop.

### Minimal setup

```bash
uv add langchain langchain-core langchain-openai
```

```python
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

@tool
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    return f"{city}: 22C, clear"

@tool
def search_docs(query: str) -> str:
    """Search internal docs by query."""
    return f"Top result for '{query}': deploy/runbook.md"

tools = [get_weather, search_docs]

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an assistant with tools. Use tools only when needed."),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, max_iterations=6, verbose=True)

print(executor.invoke({"input": "What weather in Kyiv and where is deploy runbook?"})["output"])
```

### Safety baseline

1. Keep only 2-5 tools at start.
2. Add strict `args_schema` for every tool.
3. Set `max_iterations`.
4. Add allowlist and audit logs.
5. Require human approval for destructive actions.

## Choosing the Right Playbook

| Need | Start with |
|------|------------|
| Quick assistant without custom data | Playbook 1 (Q&A) |
| Answers from your docs with grounding | Playbook 2 (RAG) |
| Dynamic multi-step actions with tools | Playbook 3 (Agent) |

If unsure: start with Q&A, then move to RAG, and only then add agent behavior.
