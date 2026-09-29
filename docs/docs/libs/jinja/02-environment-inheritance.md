---
date: 2026-09-29
tags:
  - python
  - libraries
  - jinja
---

# Jinja — Environment, Loaders & Inheritance

## Environment

`Environment` holds the configuration and the template cache. Create it once (module level or a pytest fixture) and reuse it.

```python
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

env = Environment(
    loader=FileSystemLoader("templates"),
    autoescape=select_autoescape(["html", "xml"]),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=True,
)
template = env.get_template("report.html")
html = template.render(run=run)             # keyword arguments
html = template.render({"run": run})        # or one dict
```

| Option | Default | Purpose |
|--------|---------|---------|
| `loader` | `None` | Where `get_template()` finds templates |
| `autoescape` | `False` | `True`, `False` or a function of the template name |
| `undefined` | `Undefined` | What a missing variable becomes (see [03](./03-customization-security.md#undefined-behaviour)) |
| `trim_blocks`, `lstrip_blocks`, `keep_trailing_newline` | `False` | Whitespace handling |
| `extensions` | `()` | For example `"jinja2.ext.loopcontrols"`, `"jinja2.ext.do"`, `"jinja2.ext.i18n"` |
| `auto_reload` | `True` | Recompile when the source file changes |
| `cache_size` | `400` | Compiled templates kept in memory; `0` disables the cache |
| `enable_async` | `False` | Allow `render_async()` and `await` inside templates |

| Method | Use |
|--------|-----|
| `env.from_string(source)` | Template from a string — tests, small snippets |
| `env.get_template(name)` | Template from the loader, cached |
| `env.select_template([a, b])` | First template that exists |
| `env.list_templates(extensions=["j2"])` | All template names — useful for "all templates compile" tests |
| `env.parse(source)` | AST only — for `jinja2.meta` analysis and syntax checks |
| `template.render(...)` / `.stream(...).dump(path)` | Render to a string / stream a large output to a file |

`jinja2.Template("...")` works for one-off strings, but it creates a shared default environment behind the scenes. In project code, use your own `Environment`.

## Loaders

```python
from jinja2 import ChoiceLoader, DictLoader, FileSystemLoader, PackageLoader, PrefixLoader

FileSystemLoader("templates")                       # a directory
FileSystemLoader(["overrides", "templates"])        # first match wins
PackageLoader("my_tests", "templates")              # my_tests/templates inside an installed package
DictLoader({"base.html": "...", "row.html": "..."})  # in memory — ideal for unit tests
ChoiceLoader([FileSystemLoader("project"), PackageLoader("my_tests")])  # override defaults
PrefixLoader({"email": FileSystemLoader("emails"), "report": FileSystemLoader("reports")})
# env.get_template("email/welcome.txt")
```

Template names always use forward slashes (`"partials/footer.html"`), even on Windows. A missing template raises `jinja2.TemplateNotFound`.

## Inheritance: extends, block, super

The base template defines the layout and named blocks. A child template overrides blocks.

```jinja
{# base.html #}
<!doctype html>
<title>{% block title %}Test Report{% endblock %}</title>
<body>
{% block content %}{% endblock %}
{% include "partials/footer.html" %}
</body>
```

```jinja
{# report.html #}
{% extends "base.html" %}
{% from "macros.html" import status_badge %}

{% block title %}{{ suite }} — {{ super() }}{% endblock %}

{% block content %}
{% for t in tests %}
<p>{{ t.name }} {{ status_badge(t.status) }}</p>
{% endfor %}
{% endblock %}
```

```python
env.get_template("report.html").render(suite="Smoke", build_id=42, tests=tests)
# <title>Smoke — Test Report</title> ... <p>login <span class="badge ...">PASSED</span></p>
```

| Feature | Syntax | Notes |
|---------|--------|-------|
| Parent block content | `{{ super() }}` | Adds to the parent block instead of replacing it |
| Reuse a block | `{{ self.title() }}` | Print a block again elsewhere in the template |
| Must be overridden | `{% block body required %}{% endblock %}` | Rendering a child without it raises `TemplateRuntimeError` |
| Block inside a loop | `{% block row scoped %}` | Without `scoped`, a block cannot see loop variables |
| Dynamic parent | `{% extends layout %}` | Parent name from a variable |

In a child template, content outside blocks is ignored, but text before `extends` is still printed — keep `extends` the first tag.

## Include

```jinja
{% include "partials/footer.html" %}                  {# sees the current context #}
{% include "partials/banner.html" ignore missing %}   {# no error if missing #}
{% include ["custom/footer.html", "footer.html"] %}   {# first that exists #}
```

## Macros, import and call

Macros are template functions — reusable fragments with arguments.

```jinja
{# macros.html #}
{% macro status_badge(status, size="sm") -%}
<span class="badge badge-{{ status }} badge-{{ size }}">{{ status | upper }}</span>
{%- endmacro %}
```

```jinja
{% import "macros.html" as ui %}          {{ ui.status_badge("failed") }}
{% from "macros.html" import status_badge %}   {{ status_badge("passed", size="lg") }}
```

Imported templates **do not** see the caller's variables by default; included templates **do**:

```python
templates = {
    "m.txt": "{% macro who() %}{{ user }}{% endmacro %}",
    "a.txt": "{% import 'm.txt' as m %}[{{ m.who() }}]",
    "b.txt": "{% import 'm.txt' as m with context %}[{{ m.who() }}]",
}
env = Environment(loader=DictLoader(templates))
env.get_template("a.txt").render(user="alice")   # '[]' — user is undefined inside the macro
env.get_template("b.txt").render(user="alice")   # '[alice]'
```

With `StrictUndefined`, case `a` raises `UndefinedError: 'user' is undefined` — one more reason to use it. Prefer passing values as macro arguments over `with context`.

Macros accept extra arguments through `varargs` and `kwargs`: `{% macro tag(name) %}{{ varargs }} {{ kwargs }}{% endmacro %}` → `tag("a", 1, x=3)` gives `(1,) {'x': 3}`.

### call blocks

`{% call %}` passes a block of template to a macro, which prints it with `caller()`:

```jinja
{% macro card(title) -%}
<div class="card"><h3>{{ title }}</h3>{{ caller() }}</div>
{%- endmacro %}

{% call card("Failures") %}
<ul>{% for t in failed %}<li>{{ t.name }}</li>{% endfor %}</ul>
{% endcall %}

{# caller with arguments #}
{% macro each(items) %}{% for i in items %}{{ caller(i) }}{% endfor %}{% endmacro %}
{% call(item) each(tests) %}<li>{{ item.name }}</li>{% endcall %}
```

## Context & Globals

The **context** is the set of variables a template sees: render arguments + environment globals + template globals.

```python
env.globals["env_name"] = "staging"                 # visible in every template
env.globals["now_iso"] = lambda: datetime.now(UTC).isoformat()
env.get_template("header.html").render(run=run)     # {{ env_name }}, {{ now_iso() }}
```

| Put in | When |
|--------|------|
| `render(**context)` | Data for this output: run results, user, ticket |
| `env.globals` | Constants and helpers for all templates: app version, URL builders |
| `env.filters` / `env.tests` | Value transformations and checks (see [03](./03-customization-security.md)) |
| `env.policies` | Settings for built-ins, for example `env.policies["json.dumps_kwargs"] = {"sort_keys": True, "ensure_ascii": False}` (default: `{"sort_keys": True}`) |

Set globals right after creating the environment — the Jinja docs advise against modifying globals after a template is loaded.

Built-in globals: `range`, `dict`, `lipsum`, `cycler`, `joiner`, `namespace`.

```jinja
{% set comma = joiner(", ") %}
{% for t in tests %}{{ comma() }}{{ t.name }}{% endfor %}   {# login, logout #}
```

## Checklist

- [ ] One `Environment` per template set, created once and reused
- [ ] Loader chosen per use: `FileSystemLoader` / `PackageLoader` in code, `DictLoader` in unit tests
- [ ] Layouts use `extends` + `block`; repeated fragments are macros
- [ ] Macros get data as arguments, not through `with context`
- [ ] Globals are set before templates are loaded

---
## See also
- [Jinja — Templates for Python](./index.md)
- [Jinja — Syntax Basics](./01-syntax-basics.md)
- [Jinja — Filters, Escaping & Security](./03-customization-security.md)
- [Jinja — QA Recipes](./04-qa-recipes.md)
