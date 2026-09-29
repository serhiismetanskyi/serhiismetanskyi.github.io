---
date: 2026-09-29
tags:
  - python
  - libraries
  - jinja
---

# Jinja — Syntax Basics

All examples render with a default `Environment()` unless the text says otherwise:

```python
from jinja2 import Environment

env = Environment()
env.from_string("{{ user.name }}").render(user={"name": "Alice"})   # 'Alice'
```

## Variables & Expressions

```jinja
{{ user.name }}          {# attribute, then item lookup #}
{{ user["name"] }}       {# item, then attribute lookup #}
{{ items[0] }}           {# index #}
{{ 2 ** 10 }} {{ 7 // 2 }} {{ 7 % 2 }}   {# 1024 3 1 #}
{{ "run-" ~ build_id }}  {# ~ converts both sides to strings and joins them #}
{{ "yes" if flag else "no" }}
{{ 3 in [1, 2, 3] }}     {# True #}
{{ user.name | upper }}  {# filter #}
```

`user.name` tries `getattr(user, "name")` first and falls back to `user["name"]`. With a dict, a key named like a dict method is shadowed by the method: `{{ d.items }}` prints `<built-in method items ...>`, `{{ d["items"] }}` returns the value. Use brackets for keys such as `items`, `keys`, `values`, `get`.

Literals: strings (`"a"`, `'a'`), numbers, lists `[1, 2]`, tuples `(1, 2)`, dicts `{"a": 1}`, `true` / `false` / `none` (lowercase; `True` / `False` / `None` also work).

## Filters

A filter transforms a value: `value | filter(args)`. Filters chain from left to right.

```jinja
{{ name | default("anonymous") }}                   {# only when name is undefined #}
{{ "" | default("empty", true) }}                   {# true → also for falsy values #}
{{ users | map(attribute="name") | join(", ") }}    {# a, b #}
{{ users | selectattr("active") | map(attribute="name") | list }}
{{ users | selectattr("age", "ge", 18) | list }}    {# test with an argument #}
{{ codes | select("ge", 500) | list }}              {# [500, 503] #}
{{ users | sort(attribute="age", reverse=true) | first }}
{{ results | sum(attribute="duration") | round(2) }}
{{ "%s-%03d" | format("case", 7) }}                 {# case-007 #}
{{ data | tojson }}                                 {# JSON, with <, >, &, ' escaped as < etc. #}
```

| Group | Filters |
|-------|---------|
| Strings | `upper`, `lower`, `title`, `capitalize`, `trim`, `replace`, `truncate`, `wordwrap`, `indent`, `center`, `striptags`, `urlencode` |
| Numbers | `int`, `float`, `round`, `abs`, `filesizeformat` |
| Lists | `length` / `count`, `first`, `last`, `join`, `sort`, `unique`, `reverse`, `min`, `max`, `sum`, `batch`, `slice`, `list` |
| Select / map | `map`, `select`, `reject`, `selectattr`, `rejectattr` |
| Dicts | `items`, `dictsort` |
| Grouping | `groupby` — returns `(grouper, list)` pairs sorted by the key |
| Output | `tojson`, `escape` / `e`, `safe`, `forceescape`, `xmlattr`, `pprint` |
| Fallback | `default` / `d` |

```jinja
{% for group in results | groupby("status") %}
{{ group.grouper }}: {{ group.list | length }}
{% endfor %}
{# failed: 1, passed: 2 — groups are sorted by the key #}
```

`default` does **not** replace `none`: `{{ value | default("n/a") }}` prints `None` when `value=None`. Use `{{ value if value is not none else "n/a" }}` or `default("n/a", true)` (which also replaces `0`, `""` and `[]`).

## Tests

A test checks a value and returns a boolean: `value is test`, `value is not test`.

```jinja
{% if user is defined and user.email is not none %}...{% endif %}
{{ 4 is even }} {{ 9 is divisibleby 3 }} {{ 2 is in [1, 2] }}
{{ "a" is string }} {{ 1 is number }} {{ {} is mapping }} {{ [1] is iterable }}
```

Common tests: `defined`, `undefined`, `none`, `boolean`, `true`, `false`, `string`, `number`, `integer`, `float`, `mapping`, `sequence`, `iterable`, `callable`, `even`, `odd`, `divisibleby`, `in`, `sameas`, `eq` / `==`, `ne`, `lt`, `le`, `gt`, `ge`, `lower`, `upper`. Tests also work in `select` / `selectattr` (`selectattr("status", "equalto", "failed")`).

## Conditions

```jinja
{% if code >= 500 %}server error{% elif code >= 400 %}client error{% else %}ok{% endif %}
```

## Loops

```jinja
{% for t in tests %}
{{ loop.index }}/{{ loop.length }} {{ t.name }}{% if loop.last %} (last){% endif %}
{% else %}
no tests collected
{% endfor %}
```

The `else` branch runs when the sequence is empty. Filter items inline — `loop` then counts only the kept items:

```jinja
{% for t in tests if t.status != "skipped" %}{{ loop.index }}:{{ t.name }} {% endfor %}
{# 1:login 2:logout #}
```

| `loop` attribute | Value |
|------------------|-------|
| `loop.index` / `loop.index0` | Position from 1 / from 0 |
| `loop.revindex` / `loop.revindex0` | Position from the end |
| `loop.first` / `loop.last` | First / last iteration |
| `loop.length` | Number of items |
| `loop.previtem` / `loop.nextitem` | Neighbour items (undefined at the edges) |
| `loop.cycle("odd", "even")` | Cycle through values — row striping |
| `loop.changed(value)` | `True` when the value differs from the previous iteration |
| `loop.depth` / `loop.depth0` | Nesting level in recursive loops |

```jinja
{% for key, value in env_vars | dictsort %}{{ key }}={{ value }}
{% endfor %}

{# Recursive loop over a tree of suites (trim_blocks + lstrip_blocks on) #}
{% for node in tree recursive %}
{{ "  " * (loop.depth - 1) }}{{ node.name }}
{{ loop(node.children) }}
{%- endfor %}
```

`{% break %}` and `{% continue %}` need the extension: `Environment(extensions=["jinja2.ext.loopcontrols"])`. Without it they are a `TemplateSyntaxError`. Usually an inline `if` filter on the loop reads better.

## Whitespace Control

By default, every tag line leaves its newline in the output:

```python
src = """<ul>
{% for t in tests %}
  <li>{{ t.name }}</li>
{% endfor %}
</ul>"""
Environment().from_string(src).render(tests=tests)
# '<ul>\n\n  <li>login</li>\n\n  <li>logout</li>\n\n</ul>'
Environment(trim_blocks=True, lstrip_blocks=True).from_string(src).render(tests=tests)
# '<ul>\n  <li>login</li>\n  <li>logout</li>\n</ul>'
```

| Option / syntax | Effect |
|-----------------|--------|
| `trim_blocks=True` | Remove the first newline after a block tag (`{% %}`) |
| `lstrip_blocks=True` | Strip spaces and tabs before a block tag at the start of a line |
| `{%-` / `-%}` (also `{{-`, `-}}`) | Strip all whitespace, including newlines, before / after this tag |
| `{%+` | Turn `lstrip_blocks` off for this tag |
| `keep_trailing_newline=True` | Keep the final newline of the template (default: removed) |

For YAML, Markdown and generated code, set all three options on the environment; use `-` only for single tags.

## Comments & Raw

```jinja
{# This is not rendered. Also works across
   several lines. #}
{% raw %}{{ this is printed as is }}{% endraw %}
```

`raw` is how you put literal `{{ }}` in the output — for example GitHub Actions `${{ secrets.TOKEN }}` or an Ansible expression inside a Jinja-generated file.

## Assignments & Scoping

```jinja
{% set total = tests | length %}
{% set header %}Run #{{ build_id }}{% endset %}   {# block set: captures rendered text #}
{% with failed = tests | selectattr("status", "equalto", "failed") | list %}
  {{ failed | length }} failed
{% endwith %}                                    {# failed exists only inside with #}
{% filter upper %}whole block in upper case{% endfilter %}
```

`if` does not create a scope, `for` does. A `set` inside a loop does not change the outer variable:

```jinja
{% set found = false %}
{% for t in tests %}{% if t.status == "failed" %}{% set found = true %}{% endif %}{% endfor %}
{{ found }}   {# False — the loop changed a loop-local copy #}
```

Use a `namespace` to carry state out of a loop:

```jinja
{% set ns = namespace(found=false, failed=0) %}
{% for t in tests %}
  {% if t.status == "failed" %}
    {% set ns.found = true %}
    {% set ns.failed = ns.failed + 1 %}
  {% endif %}
{% endfor %}
{{ ns.found }} {{ ns.failed }}   {# True 1 #}
```

Better still: compute it without state — `{{ tests | selectattr("status", "equalto", "failed") | list | length }}` — or pass the number from Python.

## Checklist

- [ ] Dict keys that clash with dict methods (`items`, `keys`, `values`) use `["key"]`
- [ ] `default` is not expected to replace `none` values
- [ ] Loop state goes through `namespace()`, not plain `set`
- [ ] Whitespace-sensitive output uses `trim_blocks` and `lstrip_blocks`
- [ ] Literal `{{ }}` in the output is wrapped in `{% raw %}`

---
## See also
- [Jinja — Templates for Python](./index.md)
- [Jinja — Environment, Loaders & Inheritance](./02-environment-inheritance.md)
- [Jinja — Filters, Escaping & Security](./03-customization-security.md)
- [Python Guide for Automation QA](../../python-guide/index.md)
