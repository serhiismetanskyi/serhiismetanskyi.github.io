---
date: 2026-08-08
tags:
  - llm
  - evaluation
  - deepeval
  - rag
---

# DeepEval Guide — Part 20: End-to-End Complex Tests

## What Is a Complex E2E Test?

A complex end-to-end test covers **one realistic dialogue scenario** that
combines all the capabilities a modern chatbot can use simultaneously:

| Component | DeepEval representation |
|-----------|------------------------|
| Dialogue history | `ConversationalTestCase` + `Turn` list |
| RAG retrieval | `retrieval_context` per assistant `Turn` |
| Tool calls | `tools_called` per assistant `Turn` |
| Quality metrics | multiple metrics applied to the same test case |

The key insight: **a single `ConversationalTestCase` can hold all of these
at once**, and you pass a list of metrics — each evaluates its own slice
of the same conversation.

---

## Why One Test Case, Many Metrics?

Running separate tests per metric means you might miss issues that only
appear when components interact. For example:
- The bot retrieved the correct policy doc (faithfulness ✓)
- But forgot the user's name from turn 1 (knowledge retention ✗)
- And called the booking tool with the wrong date (tool correctness ✗)

Only an end-to-end test catches all three at once in context.

---

## The Scenario: Travel Assistant Chatbot

The chatbot is a **travel booking assistant** that:
1. Greets the user and remembers their name
2. Retrieves airline policy from a knowledge base (RAG)
3. Calls `search_flights` to find available options
4. Calls `book_flight` to confirm the booking
5. Closes the conversation with a summary

This single dialogue tests: knowledge retention, RAG faithfulness,
tool correctness, conversation completeness, role adherence, and goal accuracy.

---

## Turn Structure With RAG + Tools

```
User turn:  content only
Assistant turn: content + retrieval_context (RAG) + tools_called (Agent)
```

Each assistant turn can independently carry retrieved documents and
tool results. Metrics read these fields from the turns they need.

---

## Full Example: ConversationalTestCase

```python
from deepeval.test_case import ConversationalTestCase, Turn, ToolCall

scenario = ConversationalTestCase(
    chatbot_role=(
        "You are a professional travel booking assistant. "
        "You help users search, compare, and book flights. "
        "You only answer travel-related questions."
    ),
    expected_outcome=(
        "User successfully books a round-trip flight to Paris "
        "and receives a confirmation number."
    ),
    turns=[
        # Turn 1 — user introduces themselves
        Turn(role="user", content="Hi, I'm Maria. I need to book a flight to Paris."),

        # Turn 2 — bot greets + retrieves luggage policy via RAG
        Turn(
            role="assistant",
            content=(
                "Hello Maria! Great choice. Paris flights include "
                "1 carry-on bag free. Let me search for available options."
            ),
            retrieval_context=[
                "Luggage policy: all economy tickets include 1 carry-on bag "
                "up to 10 kg. Checked luggage costs €25 extra per bag.",
            ],
        ),

        # Turn 3 — user specifies travel dates
        Turn(
            role="user",
            content="Departing April 10, returning April 17. Economy class.",
        ),

        # Turn 4 — bot searches flights via tool
        Turn(
            role="assistant",
            content=(
                "I found 3 flights for April 10. "
                "The cheapest is FlightX at €199 departing at 08:00."
            ),
            tools_called=[
                ToolCall(
                    name="search_flights",
                    input_parameters={
                        "origin": "KBP",
                        "destination": "CDG",
                        "departure_date": "2026-04-10",
                        "return_date": "2026-04-17",
                        "cabin": "economy",
                    },
                    output=(
                        "3 flights found. "
                        "FlightX AA101 08:00 €199, "
                        "AirFast BF202 12:00 €239, "
                        "EasyJet EZ303 18:00 €179"
                    ),
                ),
            ],
        ),

        # Turn 5 — user picks a flight
        Turn(role="user", content="Book the cheapest one please."),

        # Turn 6 — bot books via tool + retrieves refund policy via RAG
        Turn(
            role="assistant",
            content=(
                "Done, Maria! I booked EasyJet EZ303 for April 10 at €179. "
                "Confirmation number: EZ-928374. "
                "Note: this fare is non-refundable but you can change dates "
                "for a €40 fee up to 48 hours before departure."
            ),
            tools_called=[
                ToolCall(
                    name="book_flight",
                    input_parameters={
                        "flight_id": "EZ303",
                        "passenger_name": "Maria",
                        "cabin": "economy",
                    },
                    output="Booking confirmed. Ref: EZ-928374",
                ),
            ],
            retrieval_context=[
                "Refund policy: non-refundable economy fares allow date "
                "changes for €40 fee if requested 48+ hours before departure.",
            ],
        ),

        # Turn 7 — user confirms they understood
        Turn(
            role="user",
            content="Perfect. Can you remind me of my booking reference?",
        ),

        # Turn 8 — bot recalls info from earlier turns (knowledge retention)
        Turn(
            role="assistant",
            content=(
                "Of course! Your booking reference is EZ-928374 "
                "for EasyJet flight EZ303 on April 10, Maria."
            ),
        ),
    ],
)
```

---

## Applying Multiple Metrics

```python
from deepeval import assert_test
from deepeval.metrics import (
    KnowledgeRetentionMetric,
    ConversationCompletenessMetric,
    GoalAccuracyMetric,
    RoleAdherenceMetric,
    ToolUseMetric,
)
from deepeval.test_case import ToolCall

metrics = [
    # Was info from earlier turns remembered?
    KnowledgeRetentionMetric(threshold=0.7),

    # Did the bot fully resolve the booking request?
    ConversationCompletenessMetric(threshold=0.7),

    # Did the bot achieve the stated expected_outcome?
    GoalAccuracyMetric(threshold=0.7),

    # Did the bot stay in its travel assistant role?
    RoleAdherenceMetric(threshold=0.7),

    # Did the bot use the right tools at the right time?
    ToolUseMetric(
        available_tools=[
            ToolCall(name="search_flights",  description="Search available flights"),
            ToolCall(name="book_flight",     description="Book a specific flight"),
            ToolCall(name="cancel_booking",  description="Cancel an existing booking"),
            ToolCall(name="get_flight_status", description="Check flight status"),
        ],
        threshold=0.7,
    ),
]

assert_test(scenario, metrics)
```

---

## What Each Metric Evaluates

| Metric | What it reads from the ConversationalTestCase |
|--------|----------------------------------------------|
| `KnowledgeRetentionMetric` | All turns — checks if bot uses facts from earlier turns |
| `ConversationCompletenessMetric` | All turns — checks if full request was resolved |
| `GoalAccuracyMetric` | All turns + `expected_outcome` — checks if goal was met |
| `RoleAdherenceMetric` | All turns + `chatbot_role` — checks character consistency |
| `ToolUseMetric` | `tools_called` per turn + `available_tools` — checks tool selection |

RAG faithfulness per turn is evaluated separately using
`TurnFaithfulnessMetric` or `FaithfulnessMetric` on individual
`LLMTestCase` snapshots extracted from turns.

---

## Extracting Per-Turn RAG Checks

For strict per-turn RAG validation, extract assistant turns that have
`retrieval_context` into standalone `LLMTestCase` objects:

```python
from deepeval.test_case import LLMTestCase
from deepeval.metrics import FaithfulnessMetric, AnswerRelevancyMetric

# Turn 2: luggage policy RAG check
rag_turn_2 = LLMTestCase(
    input="I need to book a flight to Paris.",
    actual_output=(
        "Hello Maria! Paris flights include 1 carry-on bag free. "
        "Let me search for available options."
    ),
    retrieval_context=[
        "Luggage policy: all economy tickets include 1 carry-on bag "
        "up to 10 kg. Checked luggage costs €25 extra per bag.",
    ],
)
assert_test(rag_turn_2, [FaithfulnessMetric(threshold=0.7),
                          AnswerRelevancyMetric(threshold=0.7)])
```

---

## Good Bot vs Broken Bot Pattern

A reliable test suite always covers both paths:

- **Positive scenario** (see example above) — well-behaved bot that remembers
  context, uses correct tools, completes the task. All metrics must pass.
- **Negative scenario** — a broken bot that forgets the user's name, calls
  irrelevant tools, and never completes the booking. Metrics like
  `GoalAccuracyMetric` and `KnowledgeRetentionMetric` must **fail** — this
  confirms the metrics can detect real regressions and are not always passing.

### Broken Bot Scenario

```python
from deepeval.test_case import ConversationalTestCase, Turn
from deepeval.test_case.llm_test_case import ToolCall

def broken_bot_scenario() -> ConversationalTestCase:
    """Broken bot: forgets name, uses wrong tool, never books."""
    return ConversationalTestCase(
        chatbot_role=CHATBOT_ROLE,
        expected_outcome=EXPECTED_OUTCOME,
        turns=[
            Turn(role="user", content="Hi, I'm Maria. I need a flight to Paris."),
            Turn(role="assistant", content="Sure, I can help. What dates?"),
            Turn(role="user", content="April 10–17, economy class."),
            Turn(
                role="assistant",
                content="I checked the weather. It will be sunny in Paris.",
                tools_called=[
                    ToolCall(
                        name="get_weather",
                        input_parameters={"city": "Paris", "date": "2026-04-10"},
                        output="Sunny, 18°C",
                    ),
                ],
            ),
            Turn(role="user", content="Book the cheapest flight please."),
            Turn(
                role="assistant",
                content="Sorry, I don't know who you are. What is your name?",
            ),
            Turn(role="user", content="I already told you — I am Maria!"),
            Turn(
                role="assistant",
                content="I apologise. Could you tell me your name again?",
            ),
        ],
    )

def test_goal_not_reached(judge_model):
    """No booking happened — GoalAccuracy must fail."""
    metric = GoalAccuracyMetric(model=judge_model, threshold=0.5, async_mode=False)
    metric.measure(broken_bot_scenario())
    assert not metric.success, f"Expected failure but score={metric.score}"

def test_knowledge_lost(judge_model):
    """Bot forgot Maria's name — KnowledgeRetention must fail."""
    metric = KnowledgeRetentionMetric(model=judge_model, threshold=0.7, async_mode=False)
    metric.measure(broken_bot_scenario())
    assert not metric.success, f"Expected failure but score={metric.score}"
```

> **Key point:** `get_weather` is not in `AVAILABLE_TOOLS` (search/book/cancel/status).
> This makes `ToolUseMetric` fail too — the bot used a tool outside its scope.

---

## Failure Aggregation Pattern

When running multiple metrics on one test case, collect all failures before
asserting. This shows every failing metric at once instead of stopping at
the first failure:

```python
from deepeval.metrics import (
    KnowledgeRetentionMetric,
    ConversationCompletenessMetric,
    GoalAccuracyMetric,
)

metrics = [
    KnowledgeRetentionMetric(threshold=0.7),
    ConversationCompletenessMetric(threshold=0.7),
    GoalAccuracyMetric(threshold=0.7),
]

failures = []
for metric in metrics:
    metric.measure(scenario)
    passed = (
        metric.success
        if metric.success is not None
        else metric.score >= metric.threshold
    )
    if not passed:
        failures.append(
            f"{metric.__name__}: score={metric.score:.2f} — {metric.reason}"
        )

assert not failures, "Failing metrics:\n" + "\n".join(failures)
```

Especially useful in E2E tests with 5+ metrics — you get a single
comprehensive failure report instead of having to re-run after each fix.

---

## Key Rules for Complex Tests

1. **One scenario per test** — one logical user story, not several mixed together.
2. **Attach `retrieval_context` only to turns that actually retrieved docs.**
3. **Attach `tools_called` only to turns where tools were invoked.**
4. **Set `expected_outcome` and `chatbot_role`** — they are required by
   `GoalAccuracyMetric` and `RoleAdherenceMetric`.
5. **Always include a negative scenario** — test a broken bot (wrong tools,
   forgotten context, incomplete task) to confirm metrics detect real failures.

---

## Sources

- [DeepEval ConversationalTestCase](https://deepeval.com/docs/evaluation-test-cases#conversational-test-cases)
- [Turn API reference](https://deepeval.com/docs/evaluation-test-cases#turn)
- [Chatbot Metrics](https://deepeval.com/docs/metrics-conversation-completeness)
- [Agent Metrics](https://deepeval.com/docs/metrics-tool-correctness)
