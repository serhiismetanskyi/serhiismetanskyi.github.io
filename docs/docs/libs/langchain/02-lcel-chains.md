---
date: 2026-09-15
tags:
  - python
  - libraries
  - langchain
  - llm
---

# LangChain — LCEL & Chains

## LCEL Overview

LangChain Expression Language (LCEL) is the declarative way to compose components using the pipe operator `|`. Every component implements the **Runnable** interface, enabling uniform `.invoke()`, `.stream()`, `.batch()`, and async variants.

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

chain = (
    ChatPromptTemplate.from_messages([("human", "{question}")])
    | ChatOpenAI(model="gpt-4o-mini")
    | StrOutputParser()
)

result = chain.invoke({"question": "What is LCEL?"})
```

The pipe `|` creates a `RunnableSequence` — output of each step feeds as input to the next.

---

## Core Runnable Types

| Runnable | Purpose | Import |
|----------|---------|--------|
| `RunnableSequence` | Chain steps (<code>a &#124; b &#124; c</code>) | Auto-created by <code>&#124;</code> |
| `RunnableParallel` | Run branches concurrently | `langchain_core.runnables` |
| `RunnableLambda` | Wrap any function | `langchain_core.runnables` |
| `RunnablePassthrough` | Pass input through unchanged | `langchain_core.runnables` |
| `RunnableBranch` | Conditional routing | `langchain_core.runnables` |

---

## RunnableParallel

Execute multiple chains concurrently and merge results into a dict.

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableParallel
from langchain_openai import ChatOpenAI

model = ChatOpenAI(model="gpt-4o-mini")
parser = StrOutputParser()

summary_chain = (
    ChatPromptTemplate.from_messages([("human", "Summarize: {text}")])
    | model | parser
)
keywords_chain = (
    ChatPromptTemplate.from_messages([("human", "Extract keywords: {text}")])
    | model | parser
)

combined = RunnableParallel(summary=summary_chain, keywords=keywords_chain)
result = combined.invoke({"text": "LangChain is a framework for LLM apps..."})
# {"summary": "...", "keywords": "..."}
```

---

## RunnablePassthrough

Pass data through unchanged — useful for injecting context alongside retrieval.

```python
from langchain_core.runnables import RunnablePassthrough

chain = RunnableParallel(
    context=retriever,
    question=RunnablePassthrough(),
) | prompt | model | parser
```

### Assign Extra Fields

```python
from langchain_core.runnables import RunnablePassthrough

chain = RunnablePassthrough.assign(
    word_count=lambda x: len(x["text"].split()),
)
# Input: {"text": "hello world"} → Output: {"text": "hello world", "word_count": 2}
```

---

## RunnableLambda

Wrap any Python function as a Runnable.

```python
from langchain_core.runnables import RunnableLambda


def clean_text(text: str) -> str:
    return text.strip().lower()


chain = RunnableLambda(clean_text) | prompt | model | parser
```

For async functions, pass `afunc` parameter:

```python
async def async_lookup(query: str) -> str:
    return await database.search(query)

runnable = RunnableLambda(func=sync_lookup, afunc=async_lookup)
```

---

## Conditional Branching

### RunnableBranch

```python
from langchain_core.runnables import RunnableBranch

branch = RunnableBranch(
    (lambda x: x["topic"] == "code", code_chain),
    (lambda x: x["topic"] == "math", math_chain),
    general_chain,  # default fallback
)

result = branch.invoke({"topic": "code", "question": "What is a closure?"})
```

### Router with RunnableLambda

```python
from langchain_core.runnables import RunnableLambda

routes = {"code": code_chain, "math": math_chain, "general": general_chain}


def route(info: dict) -> str:
    return routes[info["topic"]]


chain = {"topic": classifier_chain, "question": lambda x: x["question"]} | RunnableLambda(route)
```

---

## Fallbacks

```python
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

primary = ChatOpenAI(model="gpt-4o")
fallback = ChatAnthropic(model="claude-sonnet-4-20250514")

resilient_model = primary.with_fallbacks([fallback])
chain = prompt | resilient_model | parser
```

If the primary model fails (rate limit, timeout, error), the fallback model is tried automatically.

---

## Batch & Async

```python
results = chain.batch([
    {"question": "What is REST?"},
    {"question": "What is GraphQL?"},
    {"question": "What is gRPC?"},
], config={"max_concurrency": 5})

import asyncio

result = asyncio.run(chain.ainvoke({"question": "What is LCEL?"}))

async for chunk in chain.astream({"question": "Explain LCEL"}):
    print(chunk, end="")
```

| Method | Input | Output |
|--------|-------|--------|
| `.invoke(input)` | Single dict | Single result |
| `.stream(input)` | Single dict | Iterator of chunks |
| `.batch(inputs)` | List of dicts | List of results |
| `.ainvoke(input)` | Single dict | Awaitable result |
| `.astream(input)` | Single dict | AsyncIterator of chunks |

---

## Config & Runtime Options

```python
result = chain.invoke(
    {"question": "Hello"},
    config={
        "run_name": "my_chain_run",
        "tags": ["production", "v2"],
        "metadata": {"user_id": "abc123"},
        "max_concurrency": 10,
        "callbacks": [my_callback_handler],
    },
)
```

| Config key | Purpose |
|------------|---------|
| `run_name` | Label in LangSmith traces |
| `tags` | Filter runs in observability |
| `metadata` | Attach arbitrary key-value pairs |
| `max_concurrency` | Limit parallel execution in `.batch()` |
| `callbacks` | Custom event handlers |

---

## Useful Corrections and Additions

### Router Return Type

In router examples, `route()` should return a runnable, not a string:

```python
from langchain_core.runnables import Runnable


def route(info: dict) -> Runnable:
    return routes[info["topic"]]
```

### Naming Steps for Traceability

```python
named_chain = (
    prompt.with_config(run_name="prompt_step")
    | model.with_config(run_name="model_step")
    | parser.with_config(run_name="parse_step")
)
```

Use `run_name` and `tags` to make LangSmith traces easier to debug in production.

---

## Plain-Language Summary

LCEL is "Unix pipes for LLM apps":

- each block does one job;
- output of block A becomes input of block B;
- you can branch, run in parallel, or route conditionally.

Think in small reusable blocks instead of one giant prompt.

## Decision Guide

| Need | Use |
|------|-----|
| Simple request-response | `prompt | model | parser` |
| Multiple independent outputs | `RunnableParallel` |
| Route by condition | `RunnableBranch` |
| Add lightweight Python logic | `RunnableLambda` |
| Keep original input while adding fields | `RunnablePassthrough.assign()` |

## Common Mistakes

1. Building one mega-chain that is hard to test.
2. Missing `run_name` and tags, making traces unreadable.
3. Not setting `max_concurrency` for large `.batch()` jobs.
4. Returning wrong data shape between steps.
