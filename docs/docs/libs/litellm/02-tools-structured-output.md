---
date: 2026-09-27
tags:
  - python
  - libraries
  - litellm
  - llm
  - pydantic
---

# LiteLLM — Tools & Structured Output

## Function Calling

Tools are always described in the **OpenAI format**. LiteLLM converts them to Anthropic `tool_use`, Gemini function declarations, Bedrock Converse tools and so on.

```python
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_order_status",
            "description": "Return the current status of an order by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string", "description": "Order ID, e.g. ord-42"},
                },
                "required": ["order_id"],
            },
        },
    }
]

response = completion(
    model="anthropic/claude-sonnet-5",
    messages=[{"role": "user", "content": "Where is my order ord-42?"}],
    tools=tools,
    tool_choice="auto",          # "auto" | "none" | "required" | {"type": "function", "function": {"name": ...}}
)

message = response.choices[0].message
for call in message.tool_calls or []:
    print(call.id, call.function.name, call.function.arguments)   # arguments is a JSON string
```

## The Tool Loop

```python
import json

from litellm import completion

HANDLERS = {"get_order_status": lambda order_id: {"order_id": order_id, "status": "shipped"}}


def run_agent(question: str, model: str = "anthropic/claude-sonnet-5", max_steps: int = 5) -> str:
    messages = [{"role": "user", "content": question}]
    for _ in range(max_steps):
        response = completion(model=model, messages=messages, tools=tools, timeout=60)
        message = response.choices[0].message
        messages.append(message.model_dump())           # keep the assistant turn with tool_calls

        if not message.tool_calls:
            return message.content

        for call in message.tool_calls:
            args = json.loads(call.function.arguments)
            result = HANDLERS[call.function.name](**args)
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(result),
            })
    raise RuntimeError("agent did not finish in max_steps")
```

Keep a step limit: models can loop on tool calls. Validate `arguments` before executing — they are model output, not trusted input.

## Structured Output

### Pydantic model as `response_format`

```python
from pydantic import BaseModel, Field

from litellm import completion


class BugReport(BaseModel):
    title: str = Field(max_length=80)
    severity: str = Field(pattern="^(blocker|critical|major|minor)$")
    steps: list[str]
    expected: str
    actual: str


response = completion(
    model="openai/gpt-4o-mini",
    messages=[{"role": "user", "content": "Turn this into a bug report: checkout button does nothing on Safari"}],
    response_format=BugReport,
)
report = BugReport.model_validate_json(response.choices[0].message.content)
```

### Raw JSON schema

```python
response_format = {
    "type": "json_schema",
    "json_schema": {
        "name": "labels",
        "schema": {
            "type": "object",
            "properties": {"label": {"type": "string", "enum": ["bug", "feature", "question"]}},
            "required": ["label"],
            "additionalProperties": False,
        },
        "strict": True,
    },
}
```

### Provider support

```python
from litellm import supports_response_schema

supports_response_schema(model="anthropic/claude-sonnet-5")
```

| Mode | What you get |
|------|--------------|
| Native JSON schema (OpenAI, Gemini, recent Anthropic models) | Output constrained to the schema |
| Fallback via tool calling | LiteLLM wraps the schema in a forced tool call and returns its arguments |
| `{"type": "json_object"}` | Valid JSON, but no schema guarantee |

!!! tip "Always validate"
    Even with native schema support, validate with Pydantic. Refusals, truncation (`finish_reason="length"`) and older models can still return invalid JSON. `litellm.enable_json_schema_validation = True` makes LiteLLM validate the response against the schema and raise on mismatch.

## Vision (Images)

```python
response = completion(
    model="anthropic/claude-sonnet-5",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "List UI defects visible on this screenshot."},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64," + b64_png}},
        ],
    }],
)
```

Handy in UI test pipelines: send a failed Playwright screenshot and get a first-pass description of what went wrong.

## Prompt Caching

Anthropic and Bedrock cache prompts marked with `cache_control`; OpenAI and Gemini cache long prefixes automatically. LiteLLM passes the marker through:

```python
messages = [
    {
        "role": "system",
        "content": [{
            "type": "text",
            "text": LONG_SPEC,                                # e.g. 20k tokens of API docs
            "cache_control": {"type": "ephemeral"},
        }],
    },
    {"role": "user", "content": "Generate negative test cases for POST /orders"},
]
response = completion(model="anthropic/claude-sonnet-5", messages=messages)
print(response.usage.prompt_tokens_details)                   # cached_tokens on cache hits
```

Put stable content (system prompt, docs, few-shot examples) first and the changing question last — caching works on prefixes.

## Reasoning Models

```python
response = completion(
    model="anthropic/claude-sonnet-5",
    messages=messages,
    reasoning_effort="medium",          # mapped to the provider's thinking/reasoning settings
)
print(response.choices[0].message.reasoning_content)          # when the provider returns it
```

---
## See also
- [LiteLLM — One API for 100+ LLM Providers](./index.md)
- [LiteLLM — Completion & Providers](./01-completion-providers.md)
- [Pydantic](../pydantic/index.md)
- [Agentic AI Architecture](../../agentic-ai-architecture/index.md)
