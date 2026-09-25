---
date: 2026-08-04
tags:
  - llm
  - evaluation
  - deepeval
  - metrics
---

# DeepEval Guide — Part 5: Chatbot Metrics

## What Are Chatbot Metrics?

Chatbot metrics test MULTI-TURN conversations. They check how well
your chatbot behaves across multiple messages, not just one question.

All chatbot metrics use `ConversationalTestCase` with a list of `Turn` objects.

### ConversationalTestCase Fields

| Field | Required | Purpose |
|-------|----------|---------|
| `turns` | Yes | List of `Turn(role, content, retrieval_context?)` |
| `chatbot_role` | No | Tells the judge what the bot is supposed to do |
| `user_description` | No | Tells the judge who is asking — improves scoring for dense docs |
| `expected_outcome` | No | Used by `GoalAccuracyMetric` |

`chatbot_role` and `user_description` help the judge calibrate what
"complete" or "on-topic" means in a specific context.

### Conversational Failure Modes

Single-turn metrics miss failures that only appear across turns:

| Failure Mode | What Happens | Example |
|---|---|---|
| **Consistency drift** | Turn N contradicts Turn 1 | Bot says "X is impossible" then later "X works if…" |
| **Semantic drift** | Same word used with shifting meaning across turns | "consistency" = physical → logical → psychological without distinction |
| **Register drift** | Confidence level changes across turns | Source hedges carefully but bot sharpens claims by turn 4 |

These require conversational metrics (`ConversationCompletenessMetric`,
`ConversationalGEval`) to detect — single-turn Faithfulness/Precision miss them.

---

## Metric 1: Knowledge Retention

**What it checks:** Does the chatbot remember information from earlier messages?

**How it works:** The judge checks if the chatbot uses facts the user shared
in previous turns. If the user says "My name is John" and later the bot
asks "What is your name?", that is a failure.

**Required fields:** `ConversationalTestCase` with turns

```python
from deepeval import assert_test
from deepeval.metrics import KnowledgeRetentionMetric
from deepeval.test_case import ConversationalTestCase, Turn

def test_knowledge_retention_pass():
    """chatbot remembers user's name from earlier."""
    test_case = ConversationalTestCase(
        turns=[
            Turn(role="user", content="Hi, my name is Anna."),
            Turn(
                role="assistant",
                content="Hello Anna! How can I help you today?",
            ),
            Turn(role="user", content="Can you remind me of my name?"),
            Turn(
                role="assistant",
                content="Of course! Your name is Anna.",
            ),
        ],
    )
    metric = KnowledgeRetentionMetric(threshold=0.7)
    assert_test(test_case, [metric])

```

---

## Metric 2: Conversation Completeness

**What it checks:** Did the chatbot fully address the user's request?

**How it works:** The judge reads the full conversation and checks if
the chatbot resolved what the user asked. Partial answers get low scores.

**Required fields:** `ConversationalTestCase` with turns

```python
from deepeval import assert_test
from deepeval.metrics import ConversationCompletenessMetric
from deepeval.test_case import ConversationalTestCase, Turn

def test_conversation_complete():
    """chatbot fully resolved the user's issue."""
    test_case = ConversationalTestCase(
        turns=[
            Turn(
                role="user",
                content="I want to return my order #5678.",
            ),
            Turn(
                role="assistant",
                content="I can help with that. "
                "What is the reason for the return?",
            ),
            Turn(role="user", content="The size is wrong."),
            Turn(
                role="assistant",
                content="I started the return for order #5678. "
                "You will receive a prepaid shipping label "
                "at your email within 24 hours. "
                "Refund will be processed in 5-7 days.",
            ),
        ],
    )
    metric = ConversationCompletenessMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 3: Role Adherence

**What it checks:** Does the chatbot stay in its assigned role?

**How it works:** You define the chatbot's role (e.g., "customer support agent").
The judge checks if the chatbot breaks character or acts outside its role.

**Required fields:** `ConversationalTestCase` with turns and `chatbot_role`

```python
from deepeval import assert_test
from deepeval.metrics import RoleAdherenceMetric
from deepeval.test_case import ConversationalTestCase, Turn

def test_role_adherence_pass():
    """chatbot stays in its support agent role."""
    test_case = ConversationalTestCase(
        chatbot_role="You are a friendly customer support agent "
        "for an online bookstore. You only help with book orders, "
        "returns, and recommendations.",
        turns=[
            Turn(role="user", content="Can you help me find a good novel?"),
            Turn(
                role="assistant",
                content="Sure! What genre do you enjoy? "
                "Mystery, romance, sci-fi, or something else?",
            ),
            Turn(role="user", content="What stocks should I buy?"),
            Turn(
                role="assistant",
                content="I can only help with book-related questions. "
                "I recommend contacting a financial advisor "
                "for stock advice.",
            ),
        ],
    )
    metric = RoleAdherenceMetric(threshold=0.7)
    assert_test(test_case, [metric])
```

---

## Metric 4: Topic Adherence

**What it checks:** Does the chatbot stay on the allowed topics?

**How it works:** You provide a list of relevant topics. The judge checks
if the chatbot's responses stay within those topics.

**Required fields:** `ConversationalTestCase` with turns

```python
from deepeval import assert_test
from deepeval.metrics import TopicAdherenceMetric
from deepeval.test_case import ConversationalTestCase, Turn

def test_topic_adherence():
    """chatbot stays on allowed topics."""
    test_case = ConversationalTestCase(
        turns=[
            Turn(role="user", content="How do I track my order?"),
            Turn(
                role="assistant",
                content="You can track your order by logging into "
                "your account and clicking 'My Orders'.",
            ),
            Turn(role="user", content="Tell me a joke."),
            Turn(
                role="assistant",
                content="I'm here to help with shopping and orders. "
                "Is there anything else I can help you with?",
            ),
        ],
    )
    metric = TopicAdherenceMetric(
        relevant_topics=[
            "order tracking",
            "shipping",
            "returns",
            "product information",
        ],
        threshold=0.7,
    )
    assert_test(test_case, [metric])
```

---

## Chatbot Metrics Summary

| Metric | What It Checks |
|--------|----------------|
| Knowledge Retention | Does bot remember earlier info? |
| Conversation Completeness | Did bot fully resolve the request? |
| Role Adherence | Does bot stay in character? |
| Topic Adherence | Does bot stay on allowed topics? |

> **Turn-Level Metrics:** For RAG chatbots, also see
> [Part 7 — Extra Metrics](07_extra_metrics.md) which covers
> `TurnRelevancyMetric`, `TurnFaithfulnessMetric`,
> `TurnContextualPrecisionMetric`, `TurnContextualRecallMetric`,
> `TurnContextualRelevancyMetric`, and `ConversationalGEval` —
> all designed for per-turn evaluation in multi-turn conversations.

---

## ConversationalGolden and Datasets

For multi-turn evaluation, use `ConversationalGolden` — a template with
`scenario` and `expected_outcome` (no actual turns yet):

```python
from deepeval.dataset import EvaluationDataset, ConversationalGolden

goldens = [
    ConversationalGolden(
        scenario="User with sore throat asking for paracetamol.",
        expected_outcome="Gets a recommendation for panadol.",
    ),
    ConversationalGolden(
        scenario="Frustrated user looking to rebook appointment.",
        expected_outcome="Gets redirected to a human agent.",
    ),
]

dataset = EvaluationDataset(goldens=goldens)
dataset.push(alias="Medical Chatbot Dataset")  # save to cloud
```

Pull later anywhere:

```python
dataset = EvaluationDataset()
dataset.pull(alias="Medical Chatbot Dataset")
```

---

## ConversationSimulator (Automated Multi-Turn Tests)

**Why?** Manual prompting is slow. Historical data is backward-looking.
`ConversationSimulator` auto-generates conversations by simulating user
interactions against your chatbot.

### Three approaches (worst → best)

| Approach | Pros | Cons |
|----------|------|------|
| Historical data | Quick, data exists | Backward-looking only |
| Manual prompting | Tests current version | Time-consuming |
| **ConversationSimulator** | Automated, consistent benchmarks | Requires setup |

### Usage

```python
from typing import List
from deepeval.test_case import Turn
from deepeval.simulator import ConversationSimulator
from deepeval.dataset import EvaluationDataset

dataset = EvaluationDataset()
dataset.pull(alias="Medical Chatbot Dataset")

def model_callback(
    input: str,
    turns: List[Turn],
    thread_id: str,
) -> Turn:
    user_input = turns[-1].content
    response = chatbot.agent_with_memory.invoke(
        {"input": user_input},
        config={"configurable": {"session_id": thread_id}},
    )
    return Turn(role="assistant", content=response["output"])

simulator = ConversationSimulator(model_callback=model_callback)
test_cases = simulator.simulate(goldens=dataset.goldens)
```

Each `ConversationalGolden` produces one `ConversationalTestCase`.
Minimum recommended: **20+ goldens** for a meaningful benchmark.

### Evaluate simulated conversations

```python
from deepeval import evaluate
from deepeval.metrics import TurnRelevancyMetric, TurnFaithfulnessMetric

evaluate(
    test_cases=test_cases,
    metrics=[TurnRelevancyMetric(), TurnFaithfulnessMetric()],
    hyperparameters={"Model": "gpt-4", "Prompt": "v2"},
)
```

### Sources

- [Chatbot Evaluation](https://www.confident-ai.com/blog/llm-chatbot-evaluation-explained-top-chatbot-evaluation-metrics-and-testing-techniques)
- [Medical Chatbot Tutorial](https://deepeval.com/tutorials/medical-chatbot/introduction)
- [ConversationSimulator Docs](https://deepeval.com/docs/conversation-simulator)
