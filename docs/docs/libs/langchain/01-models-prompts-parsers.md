---
date: 2026-09-15
tags:
  - python
  - libraries
  - langchain
  - llm
---

# LangChain — Models, Prompts & Parsers

## Chat Models

```python
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic

openai_llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0,
    max_tokens=1024,
    timeout=30,
    max_retries=2,
)

anthropic_llm = ChatAnthropic(
    model="claude-sonnet-4-20250514",
    temperature=0,
    max_tokens=1024,
)
```

| Parameter | Purpose |
|-----------|---------|
| `model` | Model identifier (`gpt-4o`, `claude-sonnet-4-20250514`, etc.) |
| `temperature` | Randomness: `0` = deterministic, `1` = creative |
| `max_tokens` | Maximum response length |
| `timeout` | Request timeout in seconds |
| `max_retries` | Auto-retry on transient failures |

### Direct Invocation

```python
from langchain_core.messages import HumanMessage, SystemMessage

messages = [
    SystemMessage(content="You are a senior Python developer."),
    HumanMessage(content="Explain decorators in 3 sentences."),
]
response = openai_llm.invoke(messages)
print(response.content)
```

---

## Message Types

```python
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
```

| Type | Role | Purpose |
|------|------|---------|
| `SystemMessage` | `system` | Sets persona, rules, constraints |
| `HumanMessage` | `user` | User input |
| `AIMessage` | `assistant` | Model response |
| `ToolMessage` | `tool` | Tool execution result (for function calling) |

---

## Prompt Templates

### ChatPromptTemplate

```python
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are an expert in {domain}."),
    ("human", "{question}"),
])

formatted = prompt.invoke({"domain": "databases", "question": "What is ACID?"})
```

### MessagesPlaceholder

```python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}"),
])
```

`MessagesPlaceholder` inserts a list of messages — used for conversation history, few-shot examples, or agent scratchpad.

### Few-Shot Prompting

```python
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", "Translate English to French."),
    ("human", "Hello"),
    ("ai", "Bonjour"),
    ("human", "Goodbye"),
    ("ai", "Au revoir"),
    ("human", "{input}"),
])

result = (prompt | model).invoke({"input": "Thank you"})
```

### Zero-Shot Prompt Template (Practical)

Use this when you do not have examples and need strict instructions.

```python
from langchain_core.prompts import ChatPromptTemplate

zero_shot_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a technical assistant. Answer briefly and accurately."),
    ("human", "{question}"),
])
```

### Chain-of-Thought Style Template (Practical)

Use this when task needs multi-step reasoning. In production, prefer concise reasoning output.

```python
cot_prompt = ChatPromptTemplate.from_messages([
    ("system", "Solve step-by-step internally. Return only concise final answer."),
    ("human", "{problem}"),
])
```

| Template style | Best for | Main risk |
|---------------|----------|-----------|
| Zero-shot | Fast/simple tasks | Under-specified behavior |
| Few-shot | Stable output style | Prompt length grows quickly |
| CoT-style | Reasoning-heavy tasks | Verbose output/cost increase |

---

## Output Parsers

### StrOutputParser

```python
from langchain_core.output_parsers import StrOutputParser

chain = prompt | model | StrOutputParser()
result = chain.invoke({"question": "What is REST?"})
# result is a plain string
```

### JsonOutputParser

```python
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field


class Review(BaseModel):
    score: int = Field(description="Rating 1-5")
    summary: str = Field(description="One-line summary")


parser = JsonOutputParser(pydantic_object=Review)

prompt = ChatPromptTemplate.from_messages([
    ("system", "Analyze the review.\n{format_instructions}"),
    ("human", "{review_text}"),
])
prompt = prompt.partial(format_instructions=parser.get_format_instructions())

chain = prompt | model | parser
result = chain.invoke({"review_text": "Great product, fast delivery!"})
```

### Structured Output (Preferred)

```python
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI


class CityInfo(BaseModel):
    name: str = Field(description="City name")
    country: str = Field(description="Country")
    population: int = Field(description="Approximate population")


llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
structured_llm = llm.with_structured_output(CityInfo)

result = structured_llm.invoke("Tell me about Paris")
print(result.name)        # "Paris"
print(result.population)  # 2161000
```

`with_structured_output()` uses native function calling — more reliable than parser-based approaches.

### Custom Parser Pattern

Use custom parser when you need domain-specific validation or normalization beyond generic JSON parsing.

```python
from langchain_core.output_parsers import BaseOutputParser


class LabelParser(BaseOutputParser[dict]):
    def parse(self, text: str) -> dict:
        raw = text.strip().lower()
        if raw not in {"approve", "reject"}:
            raise ValueError(f"Unexpected label: {raw}")
        return {"label": raw}


custom_chain = prompt | model | LabelParser()
result = custom_chain.invoke({"question": "Decision?"})
```

Custom parser is useful for strict contracts in automation flows.

---

## Streaming

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

chain = (
    ChatPromptTemplate.from_messages([("human", "{question}")])
    | ChatOpenAI(model="gpt-4o-mini")
    | StrOutputParser()
)

for chunk in chain.stream({"question": "Explain microservices"}):
    print(chunk, end="", flush=True)
```

| Method | Use case |
|--------|----------|
| `.invoke()` | Single request → single response |
| `.stream()` | Token-by-token streaming |
| `.batch()` | Multiple inputs in parallel |
| `.ainvoke()` | Async single request |
| `.astream()` | Async streaming |

---

## Model Configuration Patterns

```python
model = ChatOpenAI(model="gpt-4o-mini", temperature=0)

bound = model.bind(stop=["\n\n"])

with_retry = model.with_retry(stop_after_attempt=3)

with_fallback = ChatOpenAI(model="gpt-4o").with_fallbacks(
    [ChatAnthropic(model="claude-sonnet-4-20250514")]
)
```

| Method | Purpose |
|--------|---------|
| `.bind()` | Fix kwargs for every call (stop tokens, tools) |
| `.with_retry()` | Auto-retry on transient errors |
| `.with_fallbacks()` | Fall back to alternate model on failure |
| `.configurable_fields()` | Make params switchable at runtime |

### Parameter Tuning Defaults (Practical)

| Parameter | Safe default | When to increase | Risk when too high |
|-----------|--------------|------------------|--------------------|
| `temperature` | `0.0-0.2` | Brainstorming/creative writing | Hallucinations |
| `top_p` | `1.0` | Alternative sampling strategy | Unstable output |
| `max_tokens` | Explicit per task | Long reasoning or long-form output | Cost spikes |
| `timeout` | `20-60s` | Slow provider/tools | Higher user-visible latency |
| `max_retries` | `2-3` | Flaky network/provider | Longer worst-case runtime |
| `stop` | Explicit for strict formats | Template-driven termination | Truncated useful output |

Use this tuning sequence: (1) set deterministic defaults, (2) fix prompt/retrieval quality, (3) then tune randomness.

---

## Streaming Events (Debugging and UI Telemetry)

Use `astream_events()` when you need step-level runtime events (not only token chunks).

```python
import asyncio


async def debug_events() -> None:
    async for event in chain.astream_events({"question": "Explain CQRS"}, version="v2"):
        print(event["event"], event.get("name"))


asyncio.run(debug_events())
```

This is useful for advanced UIs, live progress indicators, and debugging nested runnables.

---

## Plain-Language Summary

- **Model** = the brain that generates text.
- **Prompt** = instructions + input format for the brain.
- **Parser** = converts model output into the format your app needs.
- **Chain** = pipeline that glues all steps together.

If output quality is poor, first check prompt clarity and output format constraints before changing the model.

## Common Beginner Mistakes

1. Sending huge unstructured prompts with no explicit output format.
2. Using free-form text where structured output is required.
3. Skipping retries/timeouts and getting random production failures.
4. Parsing raw strings manually instead of using `with_structured_output()`.

## Minimum Working Baseline (Recommended)

For first production-safe version:

- set `temperature=0`;
- set `timeout` and `max_retries`;
- use `with_structured_output()` for machine-readable results;
- enable tracing (`LANGCHAIN_TRACING_V2=true`);
- add one fallback model.
