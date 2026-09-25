---
date: 2026-06-22
tags:
  - ai-agents
  - llm
---

# Tool Integration & Prompt Engineering

## Tool Integration

### Function Calling (OpenAI Style)

Define JSON schemas for functions. The LLM decides when and how to call them.

**Tool schema:**
```json
{
  "name": "search_flights",
  "description": "Search available flights between cities",
  "parameters": {
    "type": "object",
    "properties": {
      "from": {"type": "string", "description": "IATA departure city code"},
      "to":   {"type": "string", "description": "IATA destination city code"},
      "date": {"type": "string", "description": "Date in YYYY-MM-DD format"}
    },
    "required": ["from", "to", "date"]
  }
}
```

**Call flow:**
```
1. App passes tool schemas via the `tools` API parameter (separate from the system prompt)
2. LLM output: {"name": "search_flights", "arguments": {"from":"NYC","to":"CHI","date":"2026-04-05"}}
3. Executor calls the real function
4. Result is returned to the LLM as a "tool" role message
5. LLM continues reasoning with the new data
```

**Python example (OpenAI SDK 2026):**
```python
import json
import openai

client = openai.OpenAI()

tools = [
    {
        "type": "function",
        "function": {
            "name": "calc",
            "description": "Evaluate a math expression",
            "parameters": {
                "type": "object",
                "properties": {"expr": {"type": "string"}},
                "required": ["expr"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is 42 * 17?"}],
    tools=tools,
    tool_choice="auto"
)

if response.choices[0].message.tool_calls:
    call = response.choices[0].message.tool_calls[0]
    args = json.loads(call.function.arguments)
    result = eval(args["expr"])  # use safe_eval in production
    print(f"Result: {result}")
```

### Tool Registry

A centralized list of available tools:

```python
TOOL_REGISTRY = {
    "search_flights": search_flights_fn,
    "search_hotels":  search_hotels_fn,
    "calculator":     safe_calculator_fn,
    "web_search":     web_search_fn,
}
```

- Tool schemas are passed via API `tools`; an optional short tool policy can be in the system prompt
- The agent can choose from a known action set
- Easy to extend without changing agent core logic

### Sandboxing and Tool Security

| Requirement | Implementation |
|-------------|---------------|
| Code isolation | Container sandbox (gVisor, Firecracker) |
| Rate limits | Max calls per task + token budget |
| Input validation | JSON schema validation before execution |
| Output validation | Type check + range check on results |
| Least privilege | Read-only DB credentials if writes are not needed |

**Never:** give the agent shell access without a sandbox.
**Always:** validate inputs and outputs before and after each tool call.

---

## Prompt Engineering Strategies

### 1. Chain-of-Thought (CoT)

Ask the LLM to reason step by step.

```
System: "Think step-by-step before answering."

User: "Plan a 3-day trip to Chicago under $1500."
```

LLM response:
```
Step 1: Estimate budget breakdown — flights ~$300, hotel ~$450, activities ~$200, food ~$300
Step 2: Search flights NYC→CHI for April 5-8
Step 3: Filter hotels downtown under $150/night
Step 4: Build daily itinerary with free/paid attractions
Answer: [structured plan]
```

**When to use:** Math, multi-step reasoning tasks, complex decisions.

### 2. ReAct (Reason + Act)

Alternates `Thought:` (reasoning) and `Action:` (tool call) in a loop.

```
System Prompt:
  You have access to tools: search_flights, search_hotels, calculator.
  Format:
    Thought: [reasoning]
    Action: tool_name({"param": "value"})
    Observation: [tool result, injected by system]
  Repeat until:
    Final Answer: [conclusion]

---

Thought: I need flights from NYC to Chicago on April 5.
Action: search_flights({"from":"NYC","to":"CHI","date":"2026-04-05"})
Observation: [{"price":189,"airline":"United"},{"price":210,"airline":"Delta"}]

Thought: United is cheapest. Now check hotels.
Action: search_hotels({"city":"Chicago","checkin":"2026-04-05","nights":3})
Observation: [{"name":"Marriott","price_per_night":120}]

Final Answer: United flight $189 + Marriott 3 nights $360 = $549 total.
```

**Best for:** Single-agent loops with multiple tools.

### 3. Tree-of-Thoughts (ToT)

Explores multiple reasoning paths in parallel.

```
Goal: "Find cheapest route"
          │
    ┌─────┴─────┐
  Path A      Path B      Path C
 (drive)      (fly)      (train)
   $320        $189        $210
    │           │
  Score        Score
   0.4         0.9  ← expand
                │
          [book flight]
```

**Algorithm:**
1. Generate N thought candidates (e.g. 3)
2. Evaluate / score each (LLM self-evaluation or heuristic)
3. Expand the most promising candidate path
4. Repeat until final answer

**When to use:** complex optimization where one CoT path is not enough.

### Strategy Comparison

| Strategy | Complexity | Token Cost | Quality | When |
|----------|-----------|------------|---------|------|
| Zero-shot | Minimal | Lowest | Basic | Simple tasks |
| CoT | Low | Medium | Good | Reasoning, math |
| ReAct | Medium | Medium | High | Tool-using agents |
| Tree-of-Thoughts | High | High | Highest | Optimization, planning |

### System Prompt Best Practices

- System prompt = identity + capabilities + rules
- User message = specific task
- Explicit stop conditions prevent infinite loops
- Test prompt variants; simpler prompts often generalize better
- For irreversible actions (for example, booking), require user confirmation
