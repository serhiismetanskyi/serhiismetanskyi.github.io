---
date: 2026-09-30
tags:
  - python
  - libraries
  - agno
  - ai-agents
  - llm
---

# Agno — Teams & Workflows

Two ways to combine agents. A **Team** is model-driven: a leader model decides which member does what. A **Workflow** is code-driven: you define the steps, and only the steps you choose call a model.

| | `Team` | `Workflow` |
|--|--------|------------|
| Who decides the next step | Leader model (delegation tool calls) | Your code: step order, `Condition`, `Router`, `Loop` |
| Steps | Member agents or nested teams | Agents, teams or plain Python functions |
| Determinism | Low | High — function steps need no model at all |
| Result | `TeamRunOutput` with `member_responses` | `WorkflowRunOutput` with `step_results` |
| Test with | Scripted leader + scripted members | Unit tests of step functions + scripted agent steps |

Rule of thumb: if you can draw the flow, write a Workflow; use a Team when the routing itself needs judgement. They nest: a workflow step can run a team, and a team member can be another team.

## Teams

```python
from agno.agent import Agent
from agno.team import Team, TeamMode

orders = Agent(
    id="orders",
    name="Orders",
    role="Answers order status questions",
    model="openai:gpt-5-mini",
    tools=[get_order_status],
)
billing = Agent(id="billing", name="Billing", role="Answers invoice and payment questions",
                model="openai:gpt-5-mini")

team = Team(
    id="support-team",
    name="Support",
    members=[orders, billing],
    model="openai:gpt-5-mini",                  # the leader
    mode=TeamMode.coordinate,
    instructions="Delegate to the right specialist. Answer in one paragraph.",
)

run = team.run("Where is ord-1?")
run.content                                     # final answer from the leader
[(t.tool_name, t.tool_args) for t in run.tools]
# [('delegate_task_to_member', {'member_id': 'orders', 'task': 'Status of ord-1'})]
[(m.agent_id, m.content) for m in run.member_responses]
# [('orders', 'ord-1 is shipped.')]
```

### Modes

| `TeamMode` | Leader tool | Behaviour |
|------------|-------------|-----------|
| `coordinate` (default) | `delegate_task_to_member(member_id, task)` | Leader picks members, writes each a task, then writes the final answer from their results |
| `route` | `delegate_task_to_member(member_id, task)` | Leader picks one member; the member's answer is returned **as is** (same as `respond_directly=True`) |
| `broadcast` | `delegate_task_to_members(task)` | Same task to every member (`arun` runs them concurrently, `run` in sequence), then the leader combines (same as `delegate_to_all_members=True`) |
| `tasks` | `create_task`, `execute_task`, `update_task_status`, `list_tasks`, `mark_all_complete`, … | Leader builds a shared task list and loops until done, at most `max_iterations` (default 10) |

- `member_id` is the member's `id`; without one Agno derives it from the name (`"Orders Agent"` → `orders-agent`). The leader sees the roster as `<member id="..." name="...">` with each member's `role` — write roles as routing rules.
- `determine_input_for_members=False` sends the user's input to members unchanged instead of a leader-written task.
- `share_member_interactions=True` shows earlier member results to later members; `add_team_history_to_members=True` passes team history to members.
- Teams accept the same `db`, `session_id`, `user_id`, `knowledge`, memory, `output_schema`, hooks and `tool_call_limit` options as agents.
- `stream=True, stream_events=True` plus `stream_member_events=True` streams member events through the team.

### Team Pitfalls

| Pitfall | Mitigation |
|---------|------------|
| Leader answers from its own knowledge instead of delegating | Instructions: "Always delegate"; test that `run.tools` contains a delegation |
| Wrong member chosen | Precise `role` per member; route-mode tests per intent |
| Leader rewrites (and distorts) member answers | `TeamMode.route` when the member's answer is final |
| Cost grows with members × iterations | `broadcast` only when every opinion is needed; cap `max_iterations` in `tasks` mode |
| Members see less context than expected | Decide explicitly on `determine_input_for_members`, `share_member_interactions` |

## Workflows

A workflow is a list of steps. Each step gets a `StepInput` and returns a `StepOutput`; agents and teams as steps receive the previous step's content as their input.

```python
from agno.agent import Agent
from agno.workflow import Condition, Step, StepInput, StepOutput, Workflow


def normalize(step_input: StepInput) -> StepOutput:
    return StepOutput(content=step_input.input.strip().lower())


def is_bug(step_input: StepInput) -> bool:
    return "error" in (step_input.previous_step_content or "")


writer = Agent(name="Writer", model="openai:gpt-5-mini", instructions="Write a one-line bug title.")

triage = Workflow(
    name="triage",
    steps=[
        Step(name="normalize", executor=normalize),                       # plain function, no model
        Condition(name="only_bugs", evaluator=is_bug,
                  steps=[Step(name="write_title", agent=writer)]),         # agent receives "checkout returns error 500"
    ],
)

run = triage.run(input="  Checkout returns ERROR 500 ")
run.status, run.content                                    # (RunStatus.completed, 'BUG: checkout error 500')
[(s.step_name, s.content) for s in run.step_results]
# [('normalize', 'checkout returns error 500'),
#  ('only_bugs', 'Condition only_bugs completed with 1 results (if branch)')]
```

When the condition is false, the steps are skipped and `run.content` is `"Condition only_bugs not met - skipped 1 steps"` — assert on the step you care about, not only on the final content.

### Step Types

| Primitive | Signature | Notes |
|-----------|-----------|-------|
| `Step(name, agent= / team= / executor=)` | Executor: `(StepInput) -> StepOutput` | Also `max_retries` (default 3), `skip_on_failure`, `description` |
| Plain function in `steps=[...]` | `(StepInput) -> StepOutput` | Wrapped in a step automatically |
| `Steps(name, steps=[...])` | — | Named group of steps |
| `Parallel(step_a, step_b, name=...)` | — | Runs branches in parallel; next step reads `get_step_content("<parallel name>")` → `{"a": ..., "b": ...}` |
| `Condition(evaluator, steps, else_steps=...)` | Evaluator: `(StepInput) -> bool` | If / else branch |
| `Loop(steps, end_condition, max_iterations=...)` | End condition: `(list[StepOutput]) -> bool` | Repeats until the condition is true or the limit is reached |
| `Router(selector, choices)` | Selector: `(StepInput) -> list[Step]` | Picks the branch(es) to run |

`StepInput` gives a step: `input` (the workflow input), `previous_step_content`, `previous_step_outputs`, `get_step_content(name)` / `get_step_output(name)`, `additional_data`, media and the workflow session. `StepOutput` carries `content`, `success`, `error`, and `stop=True` ends the workflow early.

```python
from agno.workflow import Loop, Parallel, Router, Step, StepInput, StepOutput, Workflow


def run_lint(step_input: StepInput) -> StepOutput:
    return StepOutput(content="lint: 0 issues")


def run_tests(step_input: StepInput) -> StepOutput:
    return StepOutput(content="tests: 42 passed")


def attempt(step_input: StepInput) -> StepOutput:
    return StepOutput(content="PASS")                        # e.g. poll a deployment until it is healthy


def merge(step_input: StepInput) -> StepOutput:
    results = step_input.get_step_content("checks")         # {'lint': '...', 'tests': '...'}
    return StepOutput(content=f"{len(results)} checks done")


def pick(step_input: StepInput) -> list[Step]:
    return [bug_path] if "error" in step_input.input.lower() else [faq_path]


def enough(outputs: list[StepOutput]) -> bool:
    return any("PASS" in str(o.content) for o in outputs)


bug_path = Step(name="bug", executor=lambda si: StepOutput(content="bug path"))
faq_path = Step(name="faq", executor=lambda si: StepOutput(content="faq path"))

pipeline = Workflow(name="pipeline", steps=[
    Parallel(Step(name="lint", executor=run_lint), Step(name="tests", executor=run_tests), name="checks"),
    Step(name="merge", executor=merge),
    Router(name="route", selector=pick, choices=[bug_path, faq_path]),
    Loop(name="retry", steps=[Step(name="attempt", executor=attempt)], end_condition=enough, max_iterations=3),
])
```

### Step Failures Are Skipped by Default

A step whose executor raises is **retried** (`max_retries=3`, so up to 4 attempts) and then **skipped**: the workflow continues and ends with `RunStatus.completed`. The failed step shows up in `run.step_results` with `success=False`, `error="..."` and content `"Step skipped due to error: ..."`.

```python
from agno.workflow import HumanReview, OnError, Step

strict_step = Step(name="charge", executor=charge_card, max_retries=0,
                   human_review=HumanReview(on_error=OnError.fail))    # the exception propagates from run()
```

`OnError.pause` pauses the workflow instead, so a human can retry or skip. In tests, assert `all(s.success for s in run.step_results)` or configure `OnError.fail` for steps that must not be skipped.

### Workflow State and History

- `Workflow(db=...)` stores workflow sessions and runs, like agents; pass `session_id` / `user_id` to `run()`.
- `session_state=` is shared by all steps (function steps can take `run_context`).
- `add_workflow_history_to_steps=True` gives agent steps the history of earlier workflow runs.
- `stream=True, stream_events=True` streams workflow and step events; `WorkflowRunOutput.step_results` holds nested results of `Parallel`, `Condition`, `Loop` and `Router` in `.steps`.

## Checklist

- [ ] Flow that can be drawn is a `Workflow`; model routing only where judgement is needed
- [ ] Every team member has `id`, `name` and a routing-quality `role`
- [ ] Route-mode teams for "one specialist answers" cases
- [ ] Step functions are plain, unit-tested functions
- [ ] Tests check `step_results[*].success`; critical steps use `OnError.fail`
- [ ] `max_iterations` / `Loop.max_iterations` bound every loop

---
## See also
- [Agno — Agents, Teams & Workflows in Python](./index.md)
- [Agno — Testing Agno Apps](./05-testing.md)
- [LangGraph — Multi-Agent Patterns](../langgraph/04-multi-agent-patterns.md)
- [Agentic AI — Multi-Agent Patterns](../../agentic-ai-architecture/02-multi-agent-patterns.md)
- [Python Libraries](../index.md)
