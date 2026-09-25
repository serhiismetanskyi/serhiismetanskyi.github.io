---
date: 2026-09-15
tags:
  - python
  - libraries
  - langchain
  - llm
---

# LangChain — Memory & State

## Memory Overview

LLMs are stateless — every call is independent. Memory components inject conversation history or context into prompts so the model can maintain continuity across turns.

---

## ConversationBufferMemory

Stores the full conversation history. Simple but grows unbounded.

```python
from langchain.memory import ConversationBufferMemory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

memory = ConversationBufferMemory(
    memory_key="history",
    return_messages=True,
)

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}"),
])
```

| Parameter | Purpose |
|-----------|---------|
| `memory_key` | Variable name in the prompt template |
| `return_messages` | Return as `Message` objects (not string) |
| `input_key` / `output_key` | Specify which chain I/O to track |

---

## ConversationBufferWindowMemory

Keeps only the last `k` exchanges — cost-effective for long sessions.

```python
from langchain.memory import ConversationBufferWindowMemory

memory = ConversationBufferWindowMemory(
    k=10,
    memory_key="history",
    return_messages=True,
)
```

---

## ConversationSummaryMemory

Summarizes older messages instead of storing verbatim — handles long conversations.

```python
from langchain.memory import ConversationSummaryMemory
from langchain_openai import ChatOpenAI

memory = ConversationSummaryMemory(
    llm=ChatOpenAI(model="gpt-4o-mini", temperature=0),
    memory_key="history",
    return_messages=True,
)
```

The LLM progressively compresses past turns into a running summary, keeping token usage bounded.

---

## ConversationSummaryBufferMemory

Hybrid: keeps recent messages verbatim + summarizes older ones.

```python
from langchain.memory import ConversationSummaryBufferMemory

memory = ConversationSummaryBufferMemory(
    llm=ChatOpenAI(model="gpt-4o-mini", temperature=0),
    max_token_limit=500,
    memory_key="history",
    return_messages=True,
)
```

When buffer exceeds `max_token_limit`, oldest messages are summarized.

---

## VectorStoreRetrieverMemory

Stores conversation facts in a vector store for semantic recall.

```python
from langchain.memory import VectorStoreRetrieverMemory
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

vectorstore = Chroma(
    collection_name="memory",
    embedding_function=OpenAIEmbeddings(),
)

memory = VectorStoreRetrieverMemory(
    retriever=vectorstore.as_retriever(search_kwargs={"k": 5}),
    memory_key="relevant_history",
)
```

Retrieves only semantically relevant past interactions — ideal for long-term user memory.

---

## Memory Type Comparison

| Type | Token cost | Best for | Limitation |
|------|-----------|----------|------------|
| Buffer | High (grows) | Short chats, debugging | Unbounded growth |
| BufferWindow | Fixed | Most chatbots | Loses old context |
| Summary | Moderate | Long conversations | Loses detail |
| SummaryBuffer | Moderate | Balanced retention | Extra LLM calls |
| VectorStore | Low per query | Long-term recall | Setup complexity |

---

## Chat Message History (Modern Approach)

The recommended pattern in LangChain v0.3+ uses `ChatMessageHistory` with `RunnableWithMessageHistory`.

```python
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_openai import ChatOpenAI

store: dict[str, BaseChatMessageHistory] = {}


def get_session_history(session_id: str) -> BaseChatMessageHistory:
    if session_id not in store:
        store[session_id] = ChatMessageHistory()
    return store[session_id]


prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}"),
])

chain = prompt | ChatOpenAI(model="gpt-4o-mini") | StrOutputParser()

with_history = RunnableWithMessageHistory(
    chain,
    get_session_history,
    input_messages_key="input",
    history_messages_key="history",
)

response = with_history.invoke(
    {"input": "My name is Alice"},
    config={"configurable": {"session_id": "user_123"}},
)
```

### Persistent History Backends

```python
from langchain_community.chat_message_histories import (
    RedisChatMessageHistory,
    SQLChatMessageHistory,
)

redis_history = RedisChatMessageHistory(
    session_id="user_123",
    url="redis://localhost:6379",
)

sql_history = SQLChatMessageHistory(
    session_id="user_123",
    connection_string="sqlite:///chat_history.db",
)
```

| Backend | Use case |
|---------|----------|
| `ChatMessageHistory` | In-memory (dev/testing) |
| `SQLChatMessageHistory` | SQLite/PostgreSQL persistence |
| `RedisChatMessageHistory` | Fast, shared across instances |
| `MongoDBChatMessageHistory` | Document-store persistence |

---

## Quick Rules

1. **Start with BufferWindow** — `k=10` covers most chatbot needs.
2. **Use `RunnableWithMessageHistory`** — modern approach, works with LCEL.
3. **Session IDs are required** — each user/thread needs a unique identifier.
4. **Use persistent backends in production** — never rely on in-memory for real apps.
5. **Vector memory for long-term** — store user preferences, facts across sessions.
6. **LangGraph for complex state** — when you need more than message history (see 06).

---

## Note on Legacy vs Modern Memory APIs

`Conversation*Memory` classes are still useful for learning and small apps, but for new production systems prefer:

1. `RunnableWithMessageHistory` for LCEL chains.
2. LangGraph state + checkpointer for agent workflows.
3. External persistent stores (`Redis`, `PostgreSQL`) for multi-instance deployments.

This avoids tight coupling to legacy chain-specific memory wiring.

---

## Plain-Language Summary

Memory answers one question: "What should the model remember between requests?"

- **Short-term memory**: recent messages in current chat.
- **Long-term memory**: important facts stored and recalled later.
- **State**: broader workflow data (not only chat text), often via LangGraph.

## Which Memory to Pick First

| Goal | Start with |
|------|------------|
| Standard chatbot | `ConversationBufferWindowMemory` (`k=10`) |
| Long chat with limited context window | `ConversationSummaryBufferMemory` |
| Facts remembered across sessions | `VectorStoreRetrieverMemory` |
| Multi-step agent workflow | LangGraph state + checkpointer |

## Common Mistakes

1. Using in-memory history in multi-instance production.
2. Storing full history forever and hitting token/cost limits.
3. Mixing user sessions by incorrect `session_id` handling.
4. Treating memory as trusted truth instead of user-provided data.

---

## Memory Drift (What It Is and How to Fix)

Memory drift happens when stored context slowly diverges from the user's real intent or latest facts.

### Typical symptoms

- Assistant keeps repeating outdated preferences.
- Old conversation details override new user instructions.
- Retrieval returns semantically similar but no longer relevant memories.

### Mitigations

1. Add recency weighting (recent messages prioritized).
2. Store memory with metadata (`timestamp`, `source`, `confidence`).
3. Require explicit user confirmation before persisting long-term facts.
4. Run periodic memory compaction/summarization jobs.
5. Add TTL for low-value memories.

### Quick operational rule

Treat long-term memory as "candidate context", not guaranteed truth.
