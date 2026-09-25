---
date: 2026-06-22
tags:
  - ai-agents
  - llm
---

# Multi-Agent Architecture Patterns

Use multi-agent systems when tasks are complex, multi-stage, or need specialization.
Each agent has its own reasoning loop, and agents collaborate to solve one goal.

## Pattern Comparison

| Pattern | Complexity | Parallelism | Fault Tolerance | When to Use |
|---------|-----------|-------------|-----------------|-------------|
| Single Agent (ReAct) | Low | — | Low | Simple, bounded tasks |
| Supervisor/Hierarchical | Medium | Yes | Medium | Multi-stage tasks with specialization |
| Hybrid Reactive-Deliberative | High | Yes | Medium | Real-time control + long-term planning |
| BDI | Medium | — | Medium | Interpretable decision logic |
| Neuro-Symbolic | Very High | — | High | Uncertainty + structured logic |

## 1. Supervisor / Hierarchical

**Core idea:** a central supervisor LLM splits the goal and delegates sub-tasks
to specialized sub-agents. Each sub-agent runs its own loop and reports back.

```
Supervisor (Orchestrator)
├── Agent A: "Search Flights"
│     └── [plan → act → observe]
├── Agent B: "Search Hotels"
│     └── [plan → act → observe]
└── Agent C: "Build Itinerary"
      └── [plan → act → observe]
```

**Trade-offs:**
- Parallel sub-task execution
- Supervisor can become a bottleneck / single point of failure
- Needs explicit shared state between agents
- Best when the task naturally splits into clear stages

**Communication pattern:**
```
Supervisor ──assign(task, context)──→ SubAgent
Supervisor ◄──result(output, status)── SubAgent
```

## 2. Hybrid Reactive-Deliberative

**Core idea:** two loops run in parallel: a fast reactive loop (urgent events)
and a slower deliberative loop (strategic planning). An Arbitrator picks which
loop gets priority.

```
           ┌─── Fast Reactive Loop ───┐
Input ──→  │  (real-time events)      │ ──→ Arbitrator ──→ Action
           └─── Slow Deliberative ───┘
                (long-term planning)
```

**When to use:** robotics and systems that need real-time control plus long-term
goals (for example, autonomous vehicles and industrial control).

**Challenges:** keeping loops synchronized and resolving conflicts when both
loops recommend different actions at the same time.

## 3. Belief-Desire-Intention (BDI)

**Core idea:** a classical AI architecture with an explicit world model.

| Component | Description | Example |
|-----------|-------------|---------|
| **Beliefs** | Current knowledge about the world | "United flight at $189 is available" |
| **Desires** | Agent's goals | "Find the cheapest route" |
| **Intentions** | Committed plans | "Book United, then Marriott" |

**Cycle:**
```
Observe → Update Beliefs → Generate Desires → Select Intentions → Execute
```

**Advantages:** interpretable and easy to trace.
**Limitations:** needs robust belief revision and struggles with open-ended tasks.

## 4. Layered Neuro-Symbolic

**Core idea:** combines neural perception (embeddings) with symbolic planning
(rules and constraints).

```
Input ──→ Neural Perception ──→ Structured State
                                      │
                               Symbolic Planner
                               (rules, constraints)
                                      │
                               Execution + Evaluation
```

**Advantages:** interpretability plus robustness under uncertainty.
**Challenges:** complex integration between neural and symbolic components.

## Multi-Agent Coordination

### Centralized Coordination

- One supervisor/orchestrator controls the flow
- Easier observability (single entry point)
- Risk: supervisor can become a bottleneck

### Decentralized Coordination

- Agents communicate via message passing / consensus
- Better fault tolerance and throughput
- More complex observability and debugging

### Workflow Graphs (DAG)

Explicit management of complex multi-agent flows via directed acyclic graphs:

```
Task A ──→ Task B ──→ Task D ──→ Final
Task A ──→ Task C ──────────────┘
```

Frameworks: LangGraph, Apache Airflow, Prefect, Temporal.

## Agent Communication Protocol

Recommended JSON format for structured inter-agent communication:

```json
{
  "agent_id": "flight-searcher-01",
  "task_id": "trip-planner-abc123",
  "action": "search_flights",
  "input": {"from": "NYC", "to": "CHI", "date": "2026-04-05"},
  "status": "completed",
  "output": [{"price": 189, "airline": "United"}],
  "trace_id": "trace-xyz"
}
```

## Multi-Agent Sub-Patterns (Interaction Topology)

Beyond the patterns above, agents can also be organized by **topology**:

| Sub-Pattern | Description | Example Use Case | Framework |
|-------------|-------------|-----------------|-----------|
| **Parallel** | Agents process sub-tasks simultaneously | Text + image processing at the same time | AutoGen GroupChat |
| **Sequential** | Agents execute tasks in order | Data pipeline: clean → analyze → report | LangChain Chain |
| **Loop** | Agent repeats a task until a condition is met | Iterative solution refinement | AutoGen + while loop |
| **Router** | One agent directs tasks to specialized agents | Customer support routing | AutoGen router agent |
| **Aggregator** | Collects and merges results from multiple agents | Merge search results | AutoGen aggregator |
| **Network** | Agents connected in a web topology, sharing info | Sensor networks, P2P agents | LangChain / custom |
| **Hierarchical** | Agents with management levels | Exec → Manager → Worker | AutoGen nested chats |

### Parallel

```python
# Run agents concurrently via asyncio (AutoGen GroupChat is turn-based, not parallel)
import asyncio

async def run_parallel(task):
    text_result, image_result = await asyncio.gather(
        text_agent.run(task),
        image_agent.run(task),
    )
    return {"text": text_result, "image": image_result}
```

### Sequential

```python
# LangChain — chain with sequential execution
pipeline = data_cleaner | data_analyzer | report_generator
result = pipeline.invoke(raw_data)
```

### Router

```python
router = autogen.AssistantAgent(
    name="Router",
    system_message="Route to billing_agent for payment questions, to tech_agent for tech issues."
)
```

### Aggregator

```python
aggregator = autogen.AssistantAgent(
    name="Aggregator",
    system_message="Combine and summarize results from all specialist agents."
)
```

## Failure Modes in Multi-Agent Systems

| Failure | Cause | Mitigation |
|---------|-------|------------|
| Supervisor overload | All requests routed through one agent | Load balancing, larger model |
| Inconsistent shared state | Race conditions between agents | Optimistic locking, event sourcing |
| Cascade failure | Sub-agent fails → supervisor fails | Circuit breaker, fallback agent |
| Communication deadlock | Agents waiting on each other | Timeout + retry with backoff |
