---
date: 2026-09-29
tags:
  - python
  - libraries
  - jinja
  - security
  - appsec
---

# Jinja — Filters, Escaping & Security

## Custom Filters, Tests & Globals

A filter is any Python function: the value before `|` is the first argument. A test returns a boolean.

```python
from datetime import timedelta

from jinja2 import Environment


def duration(seconds: float) -> str:
    return str(timedelta(seconds=round(seconds)))


def mask(value: str, keep: int = 4) -> str:
    return "*" * max(len(value) - keep, 0) + value[-keep:]


def is_flaky(test: dict) -> bool:
    return test.get("retries", 0) > 0


env = Environment()
env.filters["duration"] = duration
env.filters["mask"] = mask
env.tests["flaky"] = is_flaky
env.globals["max_retries"] = 3
```

```jinja
{{ 3725 | duration }}                 {# 1:02:05 #}
{{ token | mask }}                    {# *********1234 #}
{{ token | mask(keep=2) }}            {# ***********34 #}
{% for t in tests if t is flaky %}{{ t.name }}{% endfor %}
{{ tests | select("flaky") | map(attribute="name") | list }}
```

Filters that need the render context or the environment get it through decorators:

```python
from jinja2 import pass_context, pass_environment


@pass_context
def tag_env(ctx, value: str) -> str:
    return f"{value} [{ctx.get('env_name', 'local')}]"


@pass_environment
def render_inline(environment, source: str) -> str:
    return environment.from_string(source).render()


env.filters["tag_env"] = tag_env    # {{ "run" | tag_env }} → run [staging]
```

`pass_context`, `pass_eval_context` and `pass_environment` replaced `contextfilter`, `evalcontextfilter` and `environmentfilter`, which were removed in Jinja 3.1. Old snippets with `@contextfilter` fail with `ImportError`.

Keep filters small and pure — then they are unit-tested as plain functions ([05](./05-testing-templates.md#custom-filters)).

## Autoescaping

Autoescaping converts `<`, `>`, `&`, `"`, `'` in rendered values to HTML entities. It is **off by default**.

```python
from jinja2 import DictLoader, Environment, select_autoescape

payload = "<script>alert(1)</script>"

Environment().from_string("<p>{{ c }}</p>").render(c=payload)
# <p><script>alert(1)</script></p>        ← XSS

env = Environment(
    loader=DictLoader({"r.html": "<p>{{ c }}</p>", "r.txt": "{{ c }}"}),
    autoescape=select_autoescape(["html", "xml"]),
)
env.get_template("r.html").render(c=payload)   # <p>&lt;script&gt;alert(1)&lt;/script&gt;</p>
env.get_template("r.txt").render(c=payload)    # <script>alert(1)</script> — .txt not escaped
env.from_string("{{ c }}").render(c=payload)   # escaped: default_for_string=True
```

`select_autoescape(enabled_extensions=("html", "htm", "xml"), disabled_extensions=(), default_for_string=True, default=False)` decides per template name. It matches the end of the name, so `"html.j2"` in the list covers `report.html.j2`.

| Tool | Effect |
|------|--------|
| `Markup("<b>ok</b>")` | Mark a string as safe — it is not escaped again |
| `Markup("<b>{}</b>").format(user_value)` | Safe template, escaped arguments: `<b>&lt;script&gt;...</b>` |
| `markupsafe.escape(value)` | Escape manually, returns `Markup` |
| `safe` filter | Trust this value in the template — **the main XSS source** |
| `e` / `escape` filter | Escape explicitly (needed when autoescape is off) |
| `{% autoescape false %}...{% endautoescape %}` | Turn it off for a block |

Autoescape protects HTML text and quoted attributes. It does **not** make every context safe:

```jinja
<a href="{{ url }}">link</a>
{# url = "javascript:alert(1)" is rendered as is — validate URL schemes in Python #}

<script>const data = {{ data | tojson }};</script>
{# tojson escapes <, >, &, ' as < etc., so "</script>" cannot close the tag #}
```

Rules: never `| safe` or `Markup()` user data; if you must render user HTML, sanitize it first (for example with `nh3.clean()`), then wrap the result in `Markup`. Keep autoescape off for non-HTML output (YAML, prompts, code) — there it would corrupt text with `&amp;` and `&#39;`.

## Undefined Behaviour

What happens with a variable that is not in the context depends on the `undefined` class:

| Class | `Hi {{ user_name }}!` | `{{ user.name }}` (no `user`) |
|-------|-----------------------|-------------------------------|
| `Undefined` (default) | `'Hi !'` — silent | `UndefinedError` |
| `ChainableUndefined` | `'Hi !'` | `''` — silent at any depth |
| `DebugUndefined` | `'Hi {{ user_name }}!'` — placeholder kept | `UndefinedError` |
| `StrictUndefined` | `UndefinedError: 'user_name' is undefined` | `UndefinedError` |

With `StrictUndefined`, any use of a missing value fails: printing, `if x`, `for i in x`, `x ~ "a"`, `x | length`. Explicit checks still work: `x is defined`, `x | default("d")` and `user.missing | default("d")`.

Why it matters for QA:

- **Test data and configs** — `timeout: {{ timeout }}` with a typo in the key renders `timeout: ` and YAML reads it as `None`. The run fails later, far from the cause.
- **LLM prompts** — a missing `{{ context }}` silently sends a prompt without the retrieved documents; the model answers anyway and the eval score drops for "no reason".
- **Reports** — an empty cell looks like "no data", not like a bug.

```python
import logging

from jinja2 import Environment, StrictUndefined, Undefined, make_logging_undefined

strict = Environment(undefined=StrictUndefined)           # fail fast: tests, CI, prompts, configs
LoggingUndefined = make_logging_undefined(logger=logging.getLogger("templates"), base=Undefined)
lenient = Environment(undefined=LoggingUndefined)         # render, but log a warning per missing name
```

## SSTI: Server-Side Template Injection

SSTI happens when user input becomes part of the **template source**, not a variable:

```python
name = request_param("name")                                    # attacker sends "{{ 7*7 }}"

Environment().from_string(f"Hello {name}").render()             # 'Hello 49'   ← vulnerable
Environment().from_string("Hello {{ name }}").render(name=name) # 'Hello {{ 7*7 }}' ← safe
```

Typical sources: `from_string()` or Flask `render_template_string()` built with f-strings or `+`, "custom email/notification templates" stored by users, report titles or prompt fragments copied into the template text.

Testing angle:

| Probe | Jinja result | Meaning |
|-------|--------------|---------|
| `{{7*7}}` | `49` | Input is evaluated by some template engine |
| `{{7*'7'}}` | `7777777` | Python-style string repetition — points to Jinja (Twig would return `49`) |
| `{{ config }}` | Flask config dump | Flask context — secrets like `SECRET_KEY` are exposed |

In a normal `Environment`, templates can walk Python internals — `__class__`, `__mro__`, `__subclasses__()`, `__globals__`. For example `{{ cycler.__init__.__globals__.os is defined }}` renders `True`: the `os` module is reachable, which leads to remote code execution. Report any evaluated probe as critical. The fix is to pass input as data, not to filter `{{`.

## SandboxedEnvironment

When users really must write templates (notification editors, report builders, prompt editors), render them in a sandbox:

```python
from jinja2.exceptions import SecurityError
from jinja2.sandbox import ImmutableSandboxedEnvironment, SandboxedEnvironment

sandbox = SandboxedEnvironment()
sandbox.from_string("{{ 7*7 }}").render()                        # '49' — normal expressions work
sandbox.from_string("{{ ''.__class__.__mro__ }}").render()
# SecurityError: access to attribute '__class__' of 'str' object is unsafe.
sandbox.from_string("{{ range(10**7) | list | length }}").render()
# OverflowError: Range too big. The sandbox blocks ranges larger than MAX_RANGE (100000).

ImmutableSandboxedEnvironment().from_string("{% set _ = items.append(4) %}").render(items=[1])
# SecurityError: access to attribute 'append' of 'list' object is unsafe.
```

Sandbox limits:

- It restricts attribute and method access. It does not limit CPU time or memory in general — nested loops can still hang a worker. Add timeouts and size limits around rendering.
- Everything you pass into the context is reachable. Pass plain data, not ORM sessions, clients or objects with dangerous methods.
- Sandbox bypasses happen: Jinja 3.1.5 and 3.1.6 fixed sandbox escapes (indirect `str.format` calls, the `|attr` filter). Pin and update Jinja.

Hugging Face `transformers` renders chat templates with `ImmutableSandboxedEnvironment` — a model repository's template is untrusted input.

## Async Rendering

```python
import asyncio

from jinja2 import Environment

env = Environment(enable_async=True)
template = env.from_string("{% set u = load_user() %}{{ u.name }}: {{ items | length }}")


async def load_user() -> dict:
    return {"name": "async-user"}


async def main() -> None:
    print(await template.render_async(load_user=load_user, items=[1, 2]))  # async-user: 2


asyncio.run(main())
```

With `enable_async=True`, coroutines are awaited automatically and `for` loops accept async iterators. Useful when a template calls async helpers; for most reports it is simpler to load all data first and render synchronously.

## NativeEnvironment

`NativeEnvironment` returns Python objects instead of strings (it runs `ast.literal_eval` on the result):

```python
from jinja2.nativetypes import NativeEnvironment

env = NativeEnvironment()
env.from_string("{{ a + b }}").render(a=1, b=2)         # 3 (int)
env.from_string("{{ [x, x * 2] }}").render(x=3)         # [3, 6] (list)
env.from_string("retries={{ n }}").render(n=3)          # 'retries=3' (str)
env.from_string("{{ flag }}").render(flag="True")       # True (bool!) — a string became a bool
```

Handy for templated values in config dicts (like Ansible does), but the type depends on the text, so strings that look like literals change type. Validate the result (for example with Pydantic).

## Checklist

- [ ] Custom filters use `pass_context` / `pass_environment`, not the removed `contextfilter`
- [ ] HTML/XML templates use `select_autoescape`; text, YAML and prompts do not
- [ ] No `| safe` or `Markup()` on user data; user HTML is sanitized first
- [ ] URLs in `href` / `src` are validated in Python; JSON in `<script>` uses `tojson`
- [ ] `StrictUndefined` in tests, CI, configs and prompts
- [ ] No template source is built from user input; SSTI probes are part of security tests
- [ ] User-written templates run in `SandboxedEnvironment` with timeouts and plain-data context
- [ ] Jinja is pinned and updated (3.1.6 or newer)

---
## See also
- [Jinja — Templates for Python](./index.md)
- [Jinja — Environment, Loaders & Inheritance](./02-environment-inheritance.md)
- [Jinja — Testing Templates](./05-testing-templates.md)
- [Code Security — Code Analysis & Review](../../code-security/03-code-analysis-review.md)
- [OWASP LLM Security Guide](../../owasp-llm-security/01-owasp-llm-security-guide.md)
