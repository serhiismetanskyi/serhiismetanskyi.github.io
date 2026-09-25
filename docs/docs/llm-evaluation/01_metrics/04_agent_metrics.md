---
date: 2026-08-03
tags:
  - llm
  - evaluation
  - deepeval
  - metrics
---

# DeepEval Guide — Part 4: AI Agent Metrics

## What is an AI Agent?

An AI agent is an LLM that can USE TOOLS. For example:
- Search the internet
- Query a database
- Call an API
- Read a file

When testing agents, we check:
- Did the agent pick the RIGHT tools?
- Did it pass the CORRECT parameters?
- Did it COMPLETE the task?

---

## Metric 1: Tool Correctness

**What it checks:** Did the agent call the right tools with the right parameters?

**How it works:** You provide `tools_called` (what the agent actually did) and
`expected_tools` (what it should have done). The judge compares them.

**Required fields:** `input`, `tools_called`, `expected_tools`

```python
from deepeval import assert_test
from deepeval.metrics import ToolCorrectnessMetric
from deepeval.test_case import LLMTestCase, ToolCall

def test_tool_correctness_pass():
    """agent called the correct tool with correct params."""
    test_case = LLMTestCase(
        input="What is the weather in London?",
        actual_output="The weather in London is 15°C and cloudy.",
        tools_called=[
            ToolCall(
                name="get_weather",
                input_parameters={"city": "London"},
                output="15°C, cloudy",
            ),
        ],
        expected_tools=[
            ToolCall(
                name="get_weather",
                input_parameters={"city": "London"},
            ),
        ],
    )
    metric = ToolCorrectnessMetric(threshold=0.7)
    assert_test(test_case, [metric])

def test_tool_correctness_wrong_tool():
    """agent called the wrong tool."""
    test_case = LLMTestCase(
        input="What is the weather in London?",
        actual_output="London is the capital of England.",
        tools_called=[
            ToolCall(
                name="search_wikipedia",
                input_parameters={"query": "London"},
                output="London is the capital of England.",
            ),
        ],
        expected_tools=[
            ToolCall(
                name="get_weather",
                input_parameters={"city": "London"},
            ),
        ],
    )
    metric = ToolCorrectnessMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 2: Task Completion (Single Turn)

**What it checks:** Did the agent complete the user's task?

**How it works:** You describe the `task`. The judge reads the `input`,
`actual_output`, and `tools_called`, then decides if the task was done.

**Required fields:** `input`, `actual_output`

```python
from deepeval import assert_test
from deepeval.metrics import TaskCompletionMetric
from deepeval.test_case import LLMTestCase, ToolCall

def test_task_completed():
    """agent completed the booking task."""
    test_case = LLMTestCase(
        input="Book a table for 2 at Pasta Place for Friday 7pm.",
        actual_output="Done! I booked a table for 2 at Pasta Place "
        "on Friday at 7:00 PM. Confirmation number: #12345.",
        tools_called=[
            ToolCall(
                name="book_restaurant",
                input_parameters={
                    "restaurant": "Pasta Place",
                    "guests": 2,
                    "date": "Friday",
                    "time": "19:00",
                },
                output="Booking confirmed. ID: #12345",
            ),
        ],
    )
    metric = TaskCompletionMetric(
        threshold=0.7,
        task="Book a restaurant table with the details the user asked for.",
    )
    assert_test(test_case, [metric])
```

---

## Metric 3: Goal Accuracy (Conversational)

**What it checks:** Did the chatbot achieve the user's goal across a conversation?

**How it works:** This is a CONVERSATIONAL metric. You provide a full
conversation with multiple turns, and the judge checks if the final
goal was reached.

**Required fields:** `ConversationalTestCase` with turns and `expected_outcome`

```python
from deepeval import assert_test
from deepeval.metrics import GoalAccuracyMetric
from deepeval.test_case import ConversationalTestCase, Turn

def test_goal_accuracy():
    """chatbot helped user reset their password."""
    test_case = ConversationalTestCase(
        expected_outcome="User successfully resets their password.",
        turns=[
            Turn(role="user", content="I forgot my password."),
            Turn(
                role="assistant",
                content="I can help you reset it. "
                "What is your email address?",
            ),
            Turn(role="user", content="user@example.com"),
            Turn(
                role="assistant",
                content="I sent a reset link to user@example.com. "
                "Please check your inbox.",
            ),
        ],
    )
    metric = GoalAccuracyMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 4: Tool Use (Conversational)

**What it checks:** Did the agent use tools correctly across a conversation?

**How it works:** Evaluates if the agent chose the right tools at each turn,
considering the available tools you defined.

**Required fields:** `ConversationalTestCase` with turns that have `tools_called`

```python
from deepeval import assert_test
from deepeval.metrics import ToolUseMetric
from deepeval.test_case import ConversationalTestCase, Turn, ToolCall

def test_tool_use_in_conversation():
    """agent used correct tools during the conversation."""
    test_case = ConversationalTestCase(
        turns=[
            Turn(role="user", content="Find flights to Paris for March 10."),
            Turn(
                role="assistant",
                content="I found 3 flights to Paris on March 10.",
                tools_called=[
                    ToolCall(
                        name="search_flights",
                        input_parameters={
                            "destination": "Paris",
                            "date": "2026-03-10",
                        },
                        output="3 flights found",
                    ),
                ],
            ),
            Turn(role="user", content="Book the cheapest one."),
            Turn(
                role="assistant",
                content="Booked! Flight AA123 at $299. "
                "Confirmation sent to your email.",
                tools_called=[
                    ToolCall(
                        name="book_flight",
                        input_parameters={"flight_id": "AA123"},
                        output="Booking confirmed",
                    ),
                ],
            ),
        ],
    )
    metric = ToolUseMetric(
        available_tools=[
            ToolCall(name="search_flights", description="Search for flights"),
            ToolCall(name="book_flight", description="Book a flight"),
            ToolCall(name="cancel_flight", description="Cancel a flight"),
        ],
        threshold=0.7,
    )
    assert_test(test_case, [metric])
```

---

## Agent Planning Metrics

These metrics test how well AI agents PLAN and EXECUTE multi-step tasks.
They check if the agent creates good plans, follows them, and does not
waste unnecessary steps.

---

## Metric 5: Plan Quality

**What it checks:** Did the agent create a good plan for the task?

**How it works:** The judge evaluates the plan the agent created before
executing. A good plan should be logical, complete, and achievable.
The agent's plan is usually in the `actual_output` or `tools_called`.

**Required fields:** `input`, `actual_output`

```python
from deepeval import assert_test
from deepeval.metrics import PlanQualityMetric
from deepeval.test_case import LLMTestCase, ToolCall

def test_good_plan():
    """agent created a logical multi-step plan."""
    test_case = LLMTestCase(
        input="Deploy the new version of the app to production.",
        actual_output="Plan: 1) Run test suite, 2) Build Docker image, "
        "3) Push to registry, 4) Update Kubernetes deployment, "
        "5) Verify health checks pass.",
        tools_called=[
            ToolCall(name="run_tests", input_parameters={"suite": "all"},
                     output="All 150 tests passed"),
            ToolCall(name="build_image", input_parameters={"tag": "v2.1.0"},
                     output="Image built successfully"),
            ToolCall(name="push_image", input_parameters={"tag": "v2.1.0"},
                     output="Pushed to registry"),
            ToolCall(name="deploy_k8s", input_parameters={"version": "v2.1.0"},
                     output="Deployment updated"),
            ToolCall(name="health_check", input_parameters={"service": "app"},
                     output="All checks green"),
        ],
    )
    metric = PlanQualityMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 6: Plan Adherence

**What it checks:** Did the agent follow its own plan?

**How it works:** The judge compares what the agent planned to do with what
it actually did. If the plan says "run tests first" but the agent skipped
tests and went straight to deployment — that is a plan adherence failure.

**Required fields:** `input`, `actual_output`

```python
from deepeval import assert_test
from deepeval.metrics import PlanAdherenceMetric
from deepeval.test_case import LLMTestCase, ToolCall

def test_plan_followed():
    """agent followed its deployment plan step by step."""
    test_case = LLMTestCase(
        input="Deploy version 2.1.0 following standard procedure.",
        actual_output="Completed deployment of v2.1.0. "
        "Ran tests (passed), built image, pushed to registry, "
        "deployed to k8s, verified health checks.",
        tools_called=[
            ToolCall(name="run_tests", input_parameters={"suite": "all"},
                     output="Passed"),
            ToolCall(name="build_image", input_parameters={"tag": "v2.1.0"},
                     output="Built"),
            ToolCall(name="deploy_k8s", input_parameters={"version": "v2.1.0"},
                     output="Deployed"),
        ],
    )
    metric = PlanAdherenceMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 7: Step Efficiency

**What it checks:** Did the agent complete the task without wasting steps?

**How it works:** The judge checks if the agent used an efficient number of
steps. If the task can be done in 3 tool calls but the agent used 8
(calling the same tool repeatedly, making unnecessary lookups, etc.),
the efficiency score is low.

**Required fields:** `input`, `actual_output`

```python
from deepeval import assert_test
from deepeval.metrics import StepEfficiencyMetric
from deepeval.test_case import LLMTestCase, ToolCall

def test_efficient_steps():
    """agent completed task in minimum steps."""
    test_case = LLMTestCase(
        input="What is the weather in London?",
        actual_output="London is currently 15°C and cloudy.",
        tools_called=[
            ToolCall(name="get_weather",
                     input_parameters={"city": "London"},
                     output="15°C, cloudy"),
        ],
    )
    metric = StepEfficiencyMetric(threshold=0.7)
    assert_test(test_case, [metric])

def test_inefficient_steps():
    """agent wasted steps — searched 3 times for same thing."""
    test_case = LLMTestCase(
        input="What is the weather in London?",
        actual_output="London is currently 15°C and cloudy.",
        tools_called=[
            ToolCall(name="search_web",
                     input_parameters={"query": "London location"},
                     output="London, UK"),
            ToolCall(name="search_web",
                     input_parameters={"query": "London coordinates"},
                     output="51.5074° N"),
            ToolCall(name="get_timezone",
                     input_parameters={"city": "London"},
                     output="GMT+0"),
            ToolCall(name="get_weather",
                     input_parameters={"city": "London"},
                     output="15°C, cloudy"),
        ],
    )
    metric = StepEfficiencyMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 8: Argument Correctness

**What it checks:** Did the agent pass correct arguments to the tools it called?

**How it works:** The judge evaluates whether the `input_parameters` passed
to each tool in `tools_called` are correct given the user's input.
This checks that the agent extracted the right values from the user request.

**Required fields:** `input`, `tools_called`

```python
from deepeval import assert_test
from deepeval.metrics import ArgumentCorrectnessMetric
from deepeval.test_case import LLMTestCase, ToolCall

def test_correct_argument():
    """the agent passed correct arguments to the tool."""
    test_case = LLMTestCase(
        input="Book a flight from London to Paris on March 10.",
        actual_output="I booked flight LH456 from London to Paris "
        "on March 10. Confirmation: #ABC123.",
        tools_called=[
            ToolCall(
                name="book_flight",
                input_parameters={
                    "origin": "London",
                    "destination": "Paris",
                    "date": "2026-03-10",
                },
                output="Booking confirmed. ID: #ABC123",
            ),
        ],
    )
    metric = ArgumentCorrectnessMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Agent Metrics Summary

| Metric | Type | What It Checks |
|--------|------|----------------|
| ToolCorrectness | Single turn | Right tool + right params? |
| TaskCompletion | Single turn | Was the task done? |
| GoalAccuracy | Conversational | Was the goal reached? |
| ToolUse | Conversational | Right tools in conversation? |
| PlanQuality | Single turn | Was the plan good? |
| PlanAdherence | Single turn | Did agent follow its plan? |
| StepEfficiency | Single turn | Were steps wasted? |
| ArgumentCorrectness | Single turn | Right args passed to tools? |

### Sources

- [DeepEval Agent Guide](https://deepeval.com/guides/guides-ai-agent-evaluation-metrics)
- [Agent Evaluation Guide](https://www.confident-ai.com/blog/llm-agent-evaluation-complete-guide)
- [Definitive Agent Evaluation](https://www.confident-ai.com/blog/definitive-ai-agent-evaluation-guide)
