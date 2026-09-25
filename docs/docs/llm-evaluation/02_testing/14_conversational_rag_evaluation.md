---
date: 2026-08-06
tags:
  - llm
  - evaluation
  - deepeval
  - rag
---

# DeepEval Guide — Part 14b: Conversational RAG Evaluation

Based on [Evaluating Conversations](https://testerstories.com/2026/04/ai-and-testing-evaluating-conversations/)
by Jeff Nyman (TesterStories, Apr 2026).

## Why Conversational Evaluation?

Single-turn metrics (Faithfulness, Precision, Recall) evaluate one question-answer
pair in isolation. Real deployments are multi-turn: users ask follow-ups, reference
prior answers, and probe inconsistencies. This creates failure modes that
single-turn metrics cannot detect (see [Chatbot Metrics](../01_metrics/05_chatbot_metrics.md#conversational-failure-modes)).

## Controlled vs Live RAG Pattern

Always run **two versions** of each conversational test:

| Version | How | Purpose |
|---|---|---|
| **Controlled** | Hand-crafted ideal responses | Validate that criteria and metric work (expect 1.0) |
| **Live RAG** | Model generates responses from retrieved chunks | Measure real pipeline quality |

If controlled cases don't score 1.0 → criteria need refinement before live
results can be interpreted. Clean baselines make live deductions real signals.

---

## Conversation History Management

Without history, the model treats each turn as fresh context and conversational
failure modes become invisible. The history string is what makes consistency
and drift failure modes testable.

```python
from langchain_ollama import ChatOllama

def run_conversation(
    turns: list[str],
    retriever,
    model: ChatOllama,
) -> list[tuple[str, str, list[str]]]:
    history: list[tuple[str, str]] = []
    results: list[tuple[str, str, list[str]]] = []

    for question in turns:
        docs = retriever.invoke(question)
        context = [doc.page_content for doc in docs]

        history_text = ""
        for j, (q, a) in enumerate(history, 1):
            history_text += f"Turn {j}\nUser: {q}\nAssistant: {a}\n\n"

        prompt = (
            f"Use only the provided context to answer.\n\n"
            f"Context:\n{chr(10).join(context)}\n\n"
            f"Conversation so far:\n{history_text}"
            f"User: {question}\nA:"
        )
        response = model.invoke(prompt).content
        history.append((question, response))
        results.append((question, response, context))

    return results
```

---

## Building Live ConversationalTestCase

Attach `retrieval_context` to each assistant turn so per-turn RAG metrics
can also evaluate the same test case:

```python
from deepeval.test_case import ConversationalTestCase, Turn

def build_live_case(
    results: list[tuple[str, str, list[str]]],
    chatbot_role: str,
    user_description: str,
) -> ConversationalTestCase:
    turns = []
    for question, answer, ctx in results:
        turns.append(Turn(role="user", content=question))
        turns.append(
            Turn(role="assistant", content=answer, retrieval_context=ctx),
        )
    return ConversationalTestCase(
        chatbot_role=chatbot_role,
        user_description=user_description,
        turns=turns,
    )
```

---

## Designing Conversations for Specific Failure Modes

Each conversation should target one failure mode with 4 progressive turns:

| Conversation | Target | Metric | Design Strategy |
|---|---|---|---|
| A: Conceptual chain | Consistency drift | `ConversationCompletenessMetric` | Each turn builds on the previous; turn 4 requires remembering turn 1 |
| B: Vocabulary trap | Semantic drift | `ConversationalGEval` (SemanticPrecision) | Same word used in different sections with shifting meaning |
| C: Register probe | Epistemic drift | `ConversationalGEval` (EpistemicHumility) | Turn 1 is a trap question; turn 4 requires precise hedging |

---

## Key Insight: Metric Non-Redundancy

The three conversational metrics measure different things and can diverge:

| Result | Interpretation |
|---|---|
| Completeness 1.0 + SemanticPrecision 0.8 | Goal met but a conceptual distinction was conflated |
| Completeness 1.0 + EpistemicHumility 0.8 | Goal met but source confidence was overstated |
| Completeness 0.6 + SemanticPrecision 1.0 | Distinctions maintained but user goal left unmet |

A 1.0 on completeness with 0.8 on precision is not a paradox — it means
the conversation served the user's intent while imperfectly maintaining
a conceptual distinction.

---

## Completeness vs Faithfulness Divergence

`ConversationCompletenessMetric` evaluates whether the **user's goal** was
addressed across the exchange. It does not check retrieval grounding per turn.

A conversation can be **complete** (user goal met) while individual responses
draw on **wrong chunks**. The model compensates by synthesizing from adjacent
material — the answer is thematically coherent but not grounded in the
optimal section.

For full diagnostic coverage, run **both** conversational and single-turn
metrics on the same material:

- **Conversational metrics** → locate the problem (which conversation failed)
- **Single-turn metrics** → diagnose the source (retrieval gap or generation error)

---

## Argumentative vs Factual Documents

Argumentative documents (essays, analyses, legal briefs) create evaluation
challenges that factual documents do not:

| Document Type | What to Verify | Best Metrics |
|---|---|---|
| **Factual** (technical papers) | Claim matches retrieved chunk | Faithfulness, Precision, Recall |
| **Argumentative** (essays, briefs) | Register, analogy handling, hedging preserved | ConversationalGEval with custom criteria |

When an essay uses cross-register analogies (e.g., calling a memory
"a Gödel sentence in consciousness"), a faithful summary reproduces the
analogy. A precise summary re-establishes the distinction afterward.
The metric catches whether the model **re-anchors** after using an analogy.

---

## Evaluation Checklist

1. Define 2–4 conversations targeting distinct failure modes
2. Hand-craft controlled responses → run metrics → confirm all score 1.0
3. Implement `run_conversation` with proper history management
4. Run live RAG cases → compare scores to controlled baselines
5. Where conversational scores drop, run single-turn metrics on those turns
6. Track whether failures are retrieval-side or generation-side

### Sources

- [Evaluating Conversations — TesterStories](https://testerstories.com/2026/04/ai-and-testing-evaluating-conversations/)
- [Chatbot Metrics](../01_metrics/05_chatbot_metrics.md)
- [ConversationalGEval](../01_metrics/07_extra_metrics.md#conversational-geval)
- [E2E Complex Tests](../03_practical/20_e2e_complex_tests.md)
