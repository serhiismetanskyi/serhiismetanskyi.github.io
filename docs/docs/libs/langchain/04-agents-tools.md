---
date: 2026-09-15
tags:
  - python
  - libraries
  - langchain
  - llm
---

# LangChain — Agents & Tools

## Tools Overview

Tools are Python functions the LLM can invoke. LangChain auto-generates the JSON schema from the function signature and docstring — the LLM decides when and how to call them.

### @tool Decorator

```python
from langchain_core.tools import tool


@tool
def search_database(query: str, limit: int = 10) -> str:
    """Search the product database by query string.

    Args:
        query: Search keywords.
        limit: Maximum results to return.
    """
    return f"Found {limit} results for '{query}'"
```

### Pydantic Schema Tool

```python
from pydantic import BaseModel, Field
from langchain_core.tools import tool


class WeatherInput(BaseModel):
    city: str = Field(description="City name")
    units: str = Field(default="celsius", description="Temperature units")


@tool(args_schema=WeatherInput)
def get_weather(city: str, units: str = "celsius") -> str:
    """Get current weather for a city."""
    return f"Weather in {city}: 22 {units}"
```

### StructuredTool

```python
from langchain_core.tools import StructuredTool


def multiply(a: int, b: int) -> int:
    """Multiply two numbers."""
    return a * b


multiply_tool = StructuredTool.from_function(
    func=multiply,
    name="multiply",
    description="Multiply two integers",
)
```

---

## Built-in Tool Integrations

```python
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_community.tools import WikipediaQueryRun
from langchain_community.utilities import WikipediaAPIWrapper

search = DuckDuckGoSearchRun()
wikipedia = WikipediaQueryRun(api_wrapper=WikipediaAPIWrapper())

result = search.invoke("LangChain latest version 2026")
```

| Tool | Purpose | Package |
|------|---------|---------|
| `DuckDuckGoSearchRun` | Web search (no API key) | `langchain-community` |
| `WikipediaQueryRun` | Wikipedia lookups | `langchain-community` |
| `PythonREPLTool` | Execute Python code | `langchain-community` |
| `ShellTool` | Run shell commands | `langchain-community` |
| `RequestsGetTool` | HTTP GET requests | `langchain-community` |

---

## Tool Calling (Function Calling)

Modern approach — the model natively selects and parameterizes tools.

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
llm_with_tools = llm.bind_tools([search_database, get_weather])

response = llm_with_tools.invoke("What's the weather in London?")
print(response.tool_calls)
# [{"name": "get_weather", "args": {"city": "London"}, "id": "call_abc123"}]
```

### Processing Tool Calls

```python
from langchain_core.messages import HumanMessage, ToolMessage

response = llm_with_tools.invoke([HumanMessage(content="Weather in Paris?")])

tool_map = {"get_weather": get_weather, "search_database": search_database}

for tool_call in response.tool_calls:
    tool = tool_map[tool_call["name"]]
    result = tool.invoke(tool_call["args"])
    tool_msg = ToolMessage(content=str(result), tool_call_id=tool_call["id"])
```

---

## ReAct Agent

The Reasoning + Acting pattern: the LLM reasons about which tool to use, acts, observes the result, and repeats until it has enough information.

```python
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

tools = [search_database, get_weather]

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant with access to tools."),
    MessagesPlaceholder(variable_name="chat_history", optional=True),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
agent = create_tool_calling_agent(llm, tools, prompt)

executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    max_iterations=10,
    handle_parsing_errors=True,
)

result = executor.invoke({"input": "What's the weather in Tokyo?"})
print(result["output"])
```

| Parameter | Purpose |
|-----------|---------|
| `verbose` | Print reasoning steps |
| `max_iterations` | Prevent infinite loops |
| `handle_parsing_errors` | Gracefully handle malformed tool calls |
| `return_intermediate_steps` | Include tool call history in output |

---

## Structured Output (Schema Forcing)

Force the model to return data matching a Pydantic schema — no agent loop needed.

```python
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI


class TaskExtraction(BaseModel):
    title: str = Field(description="Task title")
    priority: str = Field(description="high, medium, or low")
    assignee: str | None = Field(description="Person assigned", default=None)


llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
structured = llm.with_structured_output(TaskExtraction)

task = structured.invoke("Fix the login bug ASAP, assign to Alice")
print(task.title)     # "Fix the login bug"
print(task.priority)  # "high"
print(task.assignee)  # "Alice"
```

---

## When to Use What

| Need | Solution |
|------|----------|
| Extract structured data | `with_structured_output()` |
| Single tool call | `bind_tools()` + manual processing |
| Multi-step reasoning | `AgentExecutor` with ReAct |
| Complex workflows with loops | LangGraph `StateGraph` (see 06) |
| Fixed pipeline | LCEL chain (no agent needed) |

---

## Tool Safety and Control Knobs

### Force or Restrict Tool Choice

```python
llm_forced = llm.bind_tools([get_weather], tool_choice="get_weather")
llm_any = llm.bind_tools([get_weather, search_database], tool_choice="auto")
```

### Disable Parallel Tool Calls (when ordering matters)

```python
llm_serial_tools = llm.bind_tools(
    [search_database, get_weather],
    parallel_tool_calls=False,
)
```

### Safe Tool Design Rules

1. Validate args with strict schemas.
2. Keep side effects idempotent where possible.
3. Add audit logging for every tool call (tool name, args hash, user/session id).
4. Require human approval for destructive tools.

---

## Plain-Language Summary

Use agents only when the number of steps is unknown in advance.

- If flow is fixed and predictable, use LCEL chain.
- If model must choose tools dynamically, use agent.
- If you need loops + approvals + persistence, use LangGraph.

## Agent vs Chain (Quick Choice)

| Situation | Better choice |
|----------|---------------|
| "Take input and return one answer" | LCEL chain |
| "Call API A, then API B, maybe retry" | LCEL or LangGraph workflow |
| "Model decides which tool to call next" | Agent |
| "High-risk actions need approval" | LangGraph with interrupts |

## Safe First Agent Setup

For first production-safe agent:

1. Keep tool set very small (2-5 tools).
2. Add strict schemas (`args_schema`) for all tools.
3. Set `max_iterations`.
4. Disable parallel tool calls if order matters.
5. Add allowlist and audit logs.
