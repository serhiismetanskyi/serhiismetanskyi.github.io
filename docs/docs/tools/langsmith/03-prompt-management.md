---
date: 2026-10-22 12:00:00
tags:
  - tools
  - observability
  - llm
  - langsmith
  - evaluation
---

# LangSmith — Prompt Management

Prompts live in the **Prompt & Context Hub** (the Prompts section of a workspace): versioned templates you edit in the Playground and pull into code with `Client.pull_prompt()`. The Hub also stores *contexts* (skills and agent instructions) with the same commit / environment model; this page covers prompts.

## Concepts

| Concept | What it is |
|---------|------------|
| **Prompt** | A named template: chat (list of role messages, recommended) or completion (one string), optionally with tools, an output schema and a model configuration |
| **Commit** | Every save creates an immutable commit with a hash; history, diff and revert are available |
| **Commit tag** | A movable label pointing at exactly one commit (`v1`, `ready-for-review`) |
| **Environment** | `staging` and `production` — reserved tags managed through **Promote** (with a per-environment history and rollback) |
| **Prompt owners** | Optional "owners only" mode: only owners can tag, promote or delete; default is any user with the `prompts:tag` permission |
| **Webhook** | One per workspace; fires on every prompt commit with the manifest |
| **Template format** | f-string `{variable}` (default) or mustache `{{variable}}` (loops, conditionals, nested keys) |

Prompt identifiers used by the SDK:

| Identifier | Resolves to |
|------------|-------------|
| `ticket-triage` | Latest commit of your prompt |
| `ticket-triage:production` | Commit the tag or environment points at |
| `ticket-triage:12344e88` | A fixed commit hash |
| `owner/name` | Public Hub prompt — requires `dangerously_pull_public_prompt=True` |

## Push

```python
from langchain_core.prompts import ChatPromptTemplate
from langsmith import Client

client = Client()

v1 = ChatPromptTemplate.from_messages([
    ("system", "You triage support tickets for {product}."),
    ("human", "{ticket}"),
])
url = client.push_prompt("ticket-triage", object=v1, commit_tags=["v1"], description="Ticket triage")

v2 = ChatPromptTemplate.from_messages([
    ("system", "You triage support tickets for {product}. Answer with JSON: priority and team."),
    ("human", "{ticket}"),
])
client.push_prompt("ticket-triage", object=v2, commit_tags=["v2"], commit_description="Force JSON output")
```

- `push_prompt` creates the prompt if it does not exist, then adds a commit on top of `parent_commit_hash="latest"`. `is_public`, `description`, `readme` and `tags` (prompt-level tags) update metadata.
- Push `prompt | model` (a `RunnableSequence`) to store the model configuration with the prompt; the provider must be supported by the Playground.
- `StructuredPrompt.from_messages_and_schema(messages, schema=Model.model_json_schema())` stores a template plus output schema.
- Reserved `staging` / `production` are assigned with **Promote** in the UI; keep immutable release tags (`v1`, `v2`) for the SDK.
- Other calls: `list_prompts(query="triage", is_public=False)`, `list_prompt_commits(name)`, `get_prompt`, `update_prompt`, `delete_prompt`, `like_prompt`.

## Pull

```python
prompt = client.pull_prompt("ticket-triage:production")
messages = prompt.invoke({"product": "WebShop", "ticket": "Checkout returns 500"}).to_messages()

chain = client.pull_prompt("ticket-triage-with-model:production", include_model=True)   # prompt | model
chain.invoke({"product": "WebShop", "ticket": "Checkout returns 500"})
```

With LangChain the result is a runnable: `prompt | ChatOpenAI(model="gpt-4o-mini")`. Without LangChain, convert the rendered prompt into a provider payload:

```python
from openai import OpenAI
from langsmith.client import convert_prompt_to_openai_format     # needs langchain-openai installed

payload = convert_prompt_to_openai_format(prompt.invoke({"product": "WebShop", "ticket": "500 on checkout"}))
resp = OpenAI().chat.completions.create(**{**payload, "model": "gpt-4o-mini"})   # payload carries a placeholder model
```

`convert_prompt_to_anthropic_format` is the Anthropic counterpart. Prompts pulled with `include_model=True` or from public owners can instantiate models and carry configuration: review them before use.

## Versions vs Environments

| Mechanism | Moves? | Use for |
|-----------|--------|---------|
| Commit hash | Never | Reproducing an exact experiment or incident |
| Release tag (`v1`, `v2`) | Manually, via SDK or UI | Stable named versions referenced from tests |
| `staging` / `production` | **Promote** / **Rollback** in the UI | What each deployment pulls without a code change |

Promoting a commit to Production does not remove it from Staging. Typical flow:

1. Edit in the Playground (or push from code), commit.
2. Run a dataset experiment against the commit ([04](./04-datasets-evaluations.md)); compare with the current production commit.
3. Promote to **Staging**; CI and pre-production pull `ticket-triage:staging`.
4. Promote to **Production** after the gate passes; the app pulls `ticket-triage:production`.
5. Roll back from the environment's rollback history if online evaluators or alerts regress.

Code should reference the environment, never a hash, in production paths.

## Caching

`pull_prompt` uses a process-wide in-memory cache with stale-while-revalidate: callers always get a fast answer and the entry refreshes in the background.

| Setting | Default | Meaning |
|---------|---------|---------|
| `max_size` | 100 | Prompts kept in the cache |
| `ttl_seconds` | 300 | Age after which an entry is stale and refreshed in the background |
| `refresh_interval_seconds` | 60 | How often stale entries are checked |

```python
from langsmith import Client
from langsmith.prompt_cache import configure_global_prompt_cache, prompt_cache_singleton

configure_global_prompt_cache(max_size=200, ttl_seconds=7200, refresh_interval_seconds=600)   # before creating clients

client = Client()
client.pull_prompt("ticket-triage:production")                     # network
client.pull_prompt("ticket-triage:production")                     # cache hit
client.pull_prompt("ticket-triage:production", skip_cache=True)    # force a fresh fetch
print(prompt_cache_singleton.metrics.hits, prompt_cache_singleton.metrics.misses)

Client(disable_prompt_cache=True)                                  # no caching for this client
```

- Tests that edit a prompt and expect the change immediately must use `skip_cache=True` or `prompt_cache_singleton.invalidate("ticket-triage:staging")`.
- **Offline / air-gapped runs**: `prompt_cache_singleton.dump("prompts_cache.json")` while online; later `configure_global_prompt_cache(ttl_seconds=None)` + `prompt_cache_singleton.load("prompts_cache.json")` serves pulls without network access.
- `prompt_cache_singleton.clear()` and `.reset_metrics()` reset state between tests.

## Playground and Prompt Canvas

| Feature | Notes |
|---------|-------|
| **Playground** | Change model, template, output schema and tools; enter variables; run and compare several prompts side by side |
| **Test over dataset** | Select a dataset, press **Start**: runs the prompt over every example and records an experiment; dataset input keys must match the prompt variables (max 15 variables) |
| **+ Evaluator** | Attach LLM-as-judge or code evaluators to the Playground experiment |
| **Prompt canvas** | Click the wand on any message: chat-driven rewrite, quick actions (reading level, length), custom quick actions, diff, **Use this Version** |
| **Chat** | AI assistance in the Playground for prompts, tools and output schemas |

Commit the prompt before starting an experiment so the run references a stable version.

## Testing Prompts in Code

```python
# tests/test_prompt_contract.py
import pytest
from langsmith import Client


@pytest.fixture(scope="module")
def prompt():
    return Client().pull_prompt("ticket-triage:staging", skip_cache=True)


def test_prompt_variables(prompt):
    assert set(prompt.input_variables) == {"product", "ticket"}          # callers pass exactly these


def test_prompt_renders(prompt):
    messages = prompt.invoke({"product": "WebShop", "ticket": "Checkout returns 500"}).to_messages()
    assert messages[-1].content == "Checkout returns 500"
    assert "JSON" in messages[0].content                                  # output-format instruction survives edits
```

Behavior testing runs the pulled prompt through the model over a dataset and records which prompt version produced the experiment:

```python
from langsmith import Client, wrappers
from openai import OpenAI

client = Client()
oai = wrappers.wrap_openai(OpenAI())
PROMPT_ID = "ticket-triage:staging"


def target(inputs: dict) -> dict:
    prompt = client.pull_prompt(PROMPT_ID, skip_cache=True)
    messages = prompt.invoke({"product": "WebShop", **inputs}).to_messages()
    resp = oai.chat.completions.create(
        model="gpt-4o-mini", temperature=0, response_format={"type": "json_object"},
        messages=[{"role": "system" if m.type == "system" else "user", "content": m.content} for m in messages],
    )
    return {"answer": resp.choices[0].message.content}


def valid_json(outputs: dict) -> bool:
    import json
    try:
        json.loads(outputs["answer"])
        return True
    except ValueError:
        return False


client.evaluate(target, data="triage-regression", evaluators=[valid_json],
                experiment_prefix="prompt-staging", metadata={"prompts": [PROMPT_ID]})
```

The `metadata["prompts"]` list fills the prompt column of the experiment table. Datasets and evaluators are covered in [04](./04-datasets-evaluations.md).

## Automation Around Commits

- **Webhook** (Prompts page → **+ Webhook**, one per workspace): POSTs `prompt_id`, `prompt_name`, `commit_hash`, `created_at`, `created_by` and `manifest` on every commit. Use it to trigger a CI evaluation job or to sync manifests into Git; the GitHub sync tutorial uses a small intermediary server that holds a GitHub token.
- API commits can pass `skip_webhooks` (true, or a list of webhook IDs) to avoid triggering them; the Playground asks which webhooks to skip.
- Per-prompt **Access and Permissions → Owners only** restricts who can promote to Production.
- Resource tags (key-value labels for workspace resources) are unrelated to commit tags.

## Pitfalls

| Pitfall | Fix |
|---------|-----|
| Edited prompt not visible in code for minutes | Cache TTL (300 s default): `skip_cache=True` in tests, short TTL or invalidation elsewhere |
| `ValueError` pulling `someone/prompt` | Public prompts need `dangerously_pull_public_prompt=True`; read the manifest first |
| Dataset run fails on missing variable | Dataset input keys must equal the prompt's `input_variables` |
| Hash pinned in production code | Pull `name:production` and promote instead of redeploying |
| Old `langchainhub` package | Deprecated; use `langsmith` |

---
## See also
- [LangSmith — LLM Tracing, Prompts & Evals](./index.md)
- [LangSmith — Datasets & Evaluations](./04-datasets-evaluations.md)
- [LangSmith — Testing, CI & Production](./05-testing-ci-production.md)
- [LangChain — LLM Application Framework](../../libs/langchain/index.md)
- [Langfuse — Prompt Management](../langfuse/03-prompt-management.md)
- [MLflow — Evaluation & Prompts](../mlflow/04-evaluation-prompts.md)
