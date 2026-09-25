---
date: 2026-08-04
tags:
  - llm
  - evaluation
  - deepeval
  - mcp
  - metrics
---

# DeepEval Guide — Part 6: MCP (Model Context Protocol) Metrics

## What is MCP?

MCP = Model Context Protocol. It is a standard way for AI agents to connect
to external tools and data sources. Think of it as a "USB port" for AI:
any AI can connect to any tool using the same protocol.

MCP defines three types of resources:
- **Tools** — functions the agent can call (e.g., search, calculate)
- **Resources** — data the agent can read (e.g., files, databases)
- **Prompts** — prompt templates the agent can use

### MCP vs Regular Tools

| Feature | Regular Tools | MCP Tools |
|---------|--------------|-----------|
| Protocol | Custom per tool | Standard MCP protocol |
| Discovery | Hard-coded | Auto-discovered from server |
| Test Fields | `tools_called` | `mcp_tools_called` |

---

## MCP Test Case Fields

When testing MCP, you use these special fields in `LLMTestCase`.

**Important:** `MCPServer.available_tools` must contain `Tool` objects from
`mcp.types`, not plain strings. `MCPToolCall.result` must be a
`CallToolResult` from `mcp.types`, not a plain dict.

```python
from mcp.types import Tool, CallToolResult, TextContent
from deepeval.test_case import LLMTestCase
from deepeval.test_case.mcp import MCPServer, MCPToolCall

test_case = LLMTestCase(
    input="...",
    actual_output="...",
    mcp_servers=[
        MCPServer(
            server_name="weather-server",
            available_tools=[
                Tool(
                    name="get_weather",
                    description="Get current weather for a city",
                    inputSchema={
                        "type": "object",
                        "properties": {"city": {"type": "string"}},
                    },
                ),
                Tool(
                    name="get_forecast",
                    description="Get weather forecast",
                    inputSchema={
                        "type": "object",
                        "properties": {"city": {"type": "string"}},
                    },
                ),
            ],
        ),
    ],
    mcp_tools_called=[
        MCPToolCall(
            name="get_weather",
            args={"city": "London"},
            result=CallToolResult(
                content=[TextContent(type="text", text="15C, cloudy")],
            ),
        ),
    ],
)
```

---

## Metric 1: MCP Use (Single Turn)

**What it checks:** Did the agent use the correct MCP tools for the request?

**How it works:** The judge checks if the agent called the right MCP tools
from the available servers. It is like ToolCorrectness but for MCP tools.

**Required fields:** `input`, `actual_output`, `mcp_tools_called`, `mcp_servers`

```python
from mcp.types import Tool, CallToolResult, TextContent
from deepeval import assert_test
from deepeval.metrics import MCPUseMetric
from deepeval.test_case import LLMTestCase
from deepeval.test_case.mcp import MCPServer, MCPToolCall

def test_mcp_use_correct_tool():
    """agent used the right MCP tool."""
    test_case = LLMTestCase(
        input="What is the weather in Berlin?",
        actual_output="Berlin is 12°C and sunny today.",
        mcp_servers=[
            MCPServer(
                server_name="weather-server",
                available_tools=[
                    Tool(
                        name="get_weather",
                        description="Get current weather",
                        inputSchema={
                            "type": "object",
                            "properties": {"city": {"type": "string"}},
                        },
                    ),
                    Tool(
                        name="get_forecast",
                        description="Get weather forecast",
                        inputSchema={
                            "type": "object",
                            "properties": {"city": {"type": "string"}},
                        },
                    ),
                ],
            ),
        ],
        mcp_tools_called=[
            MCPToolCall(
                name="get_weather",
                args={"city": "Berlin"},
                result=CallToolResult(
                    content=[
                        TextContent(type="text", text="12C, sunny"),
                    ],
                ),
            ),
        ],
    )
    metric = MCPUseMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 2: MCP Task Completion (Conversational)

**What it checks:** Did the agent complete the task using MCP tools
across a conversation?

**How it works:** Evaluates the full conversation to see if the agent
used MCP tools correctly to achieve the user's goal.

**Required fields:** `ConversationalTestCase` with turns that have `mcp_tools_called`

```python
from mcp.types import Tool, CallToolResult, TextContent
from deepeval import assert_test
from deepeval.metrics import MCPTaskCompletionMetric
from deepeval.test_case import ConversationalTestCase, Turn
from deepeval.test_case.mcp import MCPServer, MCPToolCall

def test_mcp_task_completion():
    """agent completed task using MCP tools across turns."""
    test_case = ConversationalTestCase(
        mcp_servers=[
            MCPServer(
                server_name="crm-server",
                available_tools=[
                    Tool(
                        name="search_customer",
                        description="Search customer by name",
                        inputSchema={
                            "type": "object",
                            "properties": {"name": {"type": "string"}},
                        },
                    ),
                    Tool(
                        name="create_ticket",
                        description="Create a support ticket",
                        inputSchema={
                            "type": "object",
                            "properties": {
                                "customer_id": {"type": "string"},
                                "type": {"type": "string"},
                            },
                        },
                    ),
                ],
            ),
        ],
        turns=[
            Turn(
                role="user",
                content="Find customer John Smith and create "
                "a support ticket for him.",
            ),
            Turn(
                role="assistant",
                content="I found John Smith in the system. "
                "Creating a support ticket now.",
                mcp_tools_called=[
                    MCPToolCall(
                        name="search_customer",
                        args={"name": "John Smith"},
                        result=CallToolResult(
                            content=[
                                TextContent(
                                    type="text",
                                    text='{"id":"C123","name":"John Smith"}',
                                ),
                            ],
                        ),
                    ),
                ],
            ),
            Turn(
                role="user",
                content="Yes, please create it.",
            ),
            Turn(
                role="assistant",
                content="Done! Ticket #T456 for John Smith.",
                mcp_tools_called=[
                    MCPToolCall(
                        name="create_ticket",
                        args={"customer_id": "C123", "type": "support"},
                        result=CallToolResult(
                            content=[
                                TextContent(
                                    type="text",
                                    text='{"ticket_id":"T456"}',
                                ),
                            ],
                        ),
                    ),
                ],
            ),
        ],
    )
    metric = MCPTaskCompletionMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 3: Multi-Turn MCP Use (Conversational)

**What it checks:** Did the agent use the right MCP tools at each turn
in a multi-step conversation?

**How it works:** Similar to MCPTaskCompletion but focuses on whether
the right tool was used at each step, not just the final result.

**Required fields:** `ConversationalTestCase` with turns

```python
from mcp.types import Tool, CallToolResult, TextContent
from deepeval import assert_test
from deepeval.metrics import MultiTurnMCPUseMetric
from deepeval.test_case import ConversationalTestCase, Turn
from deepeval.test_case.mcp import MCPServer, MCPToolCall

def test_multi_turn_mcp_use():
    """agent used correct MCP tools at each step."""
    test_case = ConversationalTestCase(
        mcp_servers=[
            MCPServer(
                server_name="file-server",
                available_tools=[
                    Tool(
                        name="list_files",
                        description="List files in a directory",
                        inputSchema={
                            "type": "object",
                            "properties": {"path": {"type": "string"}},
                        },
                    ),
                    Tool(
                        name="read_file",
                        description="Read file contents",
                        inputSchema={
                            "type": "object",
                            "properties": {"path": {"type": "string"}},
                        },
                    ),
                ],
            ),
        ],
        turns=[
            Turn(
                role="user",
                content="List all files in the reports folder.",
            ),
            Turn(
                role="assistant",
                content="Found 3 files: report1.csv, "
                "report2.csv, summary.txt",
                mcp_tools_called=[
                    MCPToolCall(
                        name="list_files",
                        args={"path": "/reports"},
                        result=CallToolResult(
                            content=[
                                TextContent(
                                    type="text",
                                    text="report1.csv, report2.csv, "
                                    "summary.txt",
                                ),
                            ],
                        ),
                    ),
                ],
            ),
            Turn(
                role="user",
                content="Read the summary file.",
            ),
            Turn(
                role="assistant",
                content="The summary says: Q4 revenue was $1.2M.",
                mcp_tools_called=[
                    MCPToolCall(
                        name="read_file",
                        args={"path": "/reports/summary.txt"},
                        result=CallToolResult(
                            content=[
                                TextContent(
                                    type="text",
                                    text="Q4 revenue was $1.2M.",
                                ),
                            ],
                        ),
                    ),
                ],
            ),
        ],
    )
    metric = MultiTurnMCPUseMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## MCP Metrics Summary

| Metric | Type | What It Checks |
|--------|------|----------------|
| MCPUse | Single turn | Right MCP tool for the request? |
| MCPTaskCompletion | Conversational | Task done via MCP tools? |
| MultiTurnMCPUse | Conversational | Right MCP tool at each step? |

### Sources

- [DeepEval MCP Docs](https://deepeval.com/docs/metrics-introduction)
- [MCP Protocol](https://modelcontextprotocol.io/)
