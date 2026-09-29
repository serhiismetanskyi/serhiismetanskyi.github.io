---
date: 2026-09-29
tags:
  - python
  - libraries
  - jinja
  - pytest
  - testing
  - code-quality
---

# Jinja — Testing Templates

Templates are code: they have branches, loops and escaping rules, and they break on refactoring. Test them at three levels:

| Level | What it catches | Tool |
|-------|-----------------|------|
| Compile / lint | Syntax errors, unknown filters, HTML issues | `env.get_template()` for every file, djLint |
| Rendering tests | Wrong branches, missing variables, escaping, empty states | pytest + `StrictUndefined` |
| Golden / snapshot | Any unexpected change in the full output | Golden files, syrupy, pytest-regressions |

Examples below test the report and prompt templates from [04 QA Recipes](./04-qa-recipes.md).

## Fixtures

```python
# tests/conftest.py
import pytest

from reporting import CaseResult, Run, make_env


@pytest.fixture
def env():
    return make_env()          # the same Environment as production: filters, StrictUndefined, autoescape


@pytest.fixture
def run() -> Run:
    return Run(
        "API smoke",
        [
            CaseResult("tests/test_users.py::test_create", "passed", 0.42),
            CaseResult("tests/test_users.py::test_delete", "failed", 1.3, "assert 500 == 204"),
            CaseResult("tests/test_auth.py::test_sso", "skipped", 0.0),
        ],
    )
```

`reporting.py` and `prompts.py` sit in the project root; with `[tool.pytest.ini_options] pythonpath = ["."]` in `pyproject.toml` the tests can import them.

Test with the **production environment factory**, not a fresh `Environment()`: otherwise tests miss the custom filters, the undefined policy and the autoescape rules.

## Rendering Tests

```python
# tests/test_templates.py
import pytest
from jinja2 import TemplateSyntaxError, UndefinedError

from reporting import CaseResult, Run


def test_summary_lists_failures(env, run):
    out = env.get_template("summary.md.j2").render(run=run)
    assert "| 3 | 1 | 1 | 1 |" in out
    assert "`tests/test_users.py::test_delete` — assert 500 == 204" in out


def test_summary_has_no_failures_section_when_green(env):
    green = Run("green", [CaseResult("t::a", "passed", 0.1)])
    out = env.get_template("summary.md.j2").render(run=green)
    assert out.startswith("## PASS — green")
    assert "### Failures" not in out


def test_missing_variable_fails_loudly(env):
    with pytest.raises(UndefinedError, match="'run' is undefined"):
        env.get_template("summary.md.j2").render()


def test_html_report_escapes_messages(env):
    evil = Run("xss", [CaseResult("t::x", "failed", 0.1, "<script>alert(1)</script>")])
    out = env.get_template("report.html.j2").render(run=evil)
    assert "<script>alert(1)</script>" not in out
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in out


@pytest.mark.parametrize(
    ("source", "context", "expected"),
    [
        ("{{ 3725 | duration }}", {}, "1:02:05"),
        ("{{ run.passed }}/{{ run.total }}", {"run": Run("r", [CaseResult("t::a", "passed", 1)])}, "1/1"),
    ],
)
def test_expressions(env, source, context, expected):
    assert env.from_string(source).render(**context) == expected


def test_all_templates_compile(env):
    for name in env.list_templates(extensions=["j2"]):
        try:
            env.get_template(name)
        except TemplateSyntaxError as exc:
            pytest.fail(f"{name}:{exc.lineno}: {exc.message}")
```

What to cover in every template:

- the **happy path** with typical data;
- the **empty state** — no tests, no failures, no examples (`for ... else`, `if` branches);
- **missing variables** — `UndefinedError` with `StrictUndefined`;
- **escaping** — HTML/XML special characters in user or test data;
- **boundaries** — long messages (`truncate`), unicode, very large lists.

`test_all_templates_compile` catches more than syntax: an unknown filter or test is a `TemplateAssertionError` (a subclass of `TemplateSyntaxError`) raised at compile time, for example `No filter named 'py'.` when a template was written for another environment. Keep templates of different environments in different folders.

## Finding Undeclared Variables

`jinja2.meta` reads the template AST without rendering:

```python
from jinja2 import Environment, meta

env = Environment()
ast = env.parse("{{ base_url }} {% for u in users %}{{ u.login }}{% endfor %} {{ timeout | default(30) }}")
meta.find_undeclared_variables(ast)        # {'base_url', 'users', 'timeout'}

ast = env.parse("{% extends 'base.html' %}{% include 'row.html' %}{% include name %}")
list(meta.find_referenced_templates(ast))  # ['base.html', 'row.html', None] — None = dynamic name
```

Variables with a `default` are still listed. Use it to assert the contract of a template — what the caller must pass — or to build a "missing keys" report before rendering a batch of configs.

## LLM Prompt Tests

Prompt templates need no LLM for most tests — only the rendered text is checked.

```python
# tests/test_prompts.py
import pytest
from jinja2 import UndefinedError, meta

from prompts import PROMPTS, render_prompt

BASE = {
    "product": "Checkout",
    "labels": ["bug", "feature", "question"],
    "examples": [],
    "reports": [{"id": 1, "text": "Pay button does nothing"}],
}


def test_prompt_declares_expected_variables():
    source = PROMPTS.loader.get_source(PROMPTS, "triage.j2")[0]
    assert meta.find_undeclared_variables(PROMPTS.parse(source)) == {
        "product", "labels", "examples", "reports",
    }


def test_prompt_contains_every_report():
    reports = [{"id": i, "text": f"report {i}"} for i in range(5)]
    prompt = render_prompt("triage", **{**BASE, "reports": reports})
    for i in range(5):
        assert f'<report id="{i}">' in prompt


def test_user_text_is_data_not_template():
    reports = [{"id": 1, "text": "Total shows {{ 7*7 }}"}]
    prompt = render_prompt("triage", **{**BASE, "reports": reports})
    assert "Total shows {{ 7*7 }}" in prompt
    assert "49" not in prompt


def test_examples_block_is_optional():
    assert "Examples:" not in render_prompt("triage", **BASE)


@pytest.mark.parametrize("missing", ["product", "labels", "reports"])
def test_missing_variable_is_an_error(missing):
    context = {k: v for k, v in BASE.items() if k != missing}
    with pytest.raises(UndefinedError):
        render_prompt("triage", **context)


def test_prompt_fits_budget():
    reports = [{"id": i, "text": "x" * 200} for i in range(20)]
    assert len(render_prompt("triage", **{**BASE, "reports": reports})) < 8_000
```

Add a golden file for the full prompt (next section): a prompt change then shows up as a diff in code review, and you can decide whether to re-run the LLM evaluation. The quality of the model's answers is tested separately, with an eval suite.

## Golden Files & Snapshots

A golden file stores the expected output; the test compares the full render with it.

```python
# tests/test_golden.py
import os
from pathlib import Path

GOLDEN = Path(__file__).parent / "golden"


def test_html_report_matches_golden(env, run):
    actual = env.get_template("report.html.j2").render(run=run)
    expected_file = GOLDEN / "report.html"
    if os.environ.get("UPDATE_GOLDEN") == "1":          # UPDATE_GOLDEN=1 pytest → rewrite
        expected_file.write_text(actual, encoding="utf-8")
    assert actual == expected_file.read_text(encoding="utf-8")
```

The same with plugins:

```python
# tests/test_snapshot.py — uv add --dev syrupy pytest-regressions
def test_summary_snapshot(env, run, snapshot):          # syrupy
    assert env.get_template("summary.md.j2").render(run=run) == snapshot


def test_report_file_regression(env, run, file_regression):   # pytest-regressions
    file_regression.check(
        env.get_template("report.html.j2").render(run=run),
        extension=".html",
    )
```

| Tool | Stores | Update command |
|------|--------|----------------|
| Hand-written golden file | Any file you choose | Your own switch (`UPDATE_GOLDEN=1`) |
| syrupy | `__snapshots__/<test_file>.ambr` | `pytest --snapshot-update` |
| pytest-regressions | `<test_file>/<test_name>.html` next to the test | `pytest --force-regen` (the first run creates the file and fails) |

Rules for snapshot tests:

- Input data must be fixed: no `datetime.now()`, random IDs or dict order you do not control. Pass the time as a variable or freeze it.
- Review snapshot diffs like code — an "update all snapshots" commit without review hides bugs.
- Keep a few focused assertions next to the snapshot: they explain **what** matters, the snapshot catches everything else.

## Custom Filters

Filters are plain functions — test them directly, and once through the environment to prove they are registered:

```python
# tests/test_filters.py
import pytest

from reporting import duration


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [(0, "0:00:00"), (59.6, "0:01:00"), (3725, "1:02:05"), (90061, "1 day, 1:01:01")],
)
def test_duration_filter(seconds, expected):
    assert duration(seconds) == expected


def test_duration_filter_is_registered(env):
    assert env.filters["duration"] is duration
    assert env.from_string("{{ 61 | duration }}").render() == "0:01:01"
```

## Linting Templates

- **Compile check** — the `test_all_templates_compile` test above, or `env.parse(source)` in a pre-commit script. `TemplateSyntaxError` has `lineno`, `message` and `name` (the template name when loaded through a loader).
- **djLint** — linter and formatter for HTML templates with a Jinja profile (this site lints its theme overrides with it):

```bash
uv add --dev djlint
uv run djlint templates/ --lint --profile=jinja --extension=html.j2    # rules like H030 meta description
uv run djlint templates/ --check --profile=jinja --extension=html.j2   # formatting diff, no changes
uv run djlint templates/ --reformat --profile=jinja --extension=html.j2
```

```toml
# pyproject.toml
[tool.djlint]
profile = "jinja"
extension = "html.j2"
ignore = "H030,H031"
```

- **Rendered output checks** — the strongest lint for non-HTML formats: parse what the template produced (`yaml.safe_load`, `json.loads`, `ast.parse`, `ET.fromstring`), then run the format's own linter (ruff for generated Python, a YAML linter for configs).

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Default `Undefined` | Empty values in configs, prompts, reports | `StrictUndefined` in tests and CI |
| Tests use `Environment()` instead of the app factory | Tests pass, production fails on filters or escaping | Build the environment in one function; use it in both |
| `safe` filter on user data | XSS in reports and emails | Escape by default; sanitize HTML before `Markup` |
| Autoescape on for YAML / prompts | `&amp;`, `&#39;` inside text | Enable autoescape by extension only |
| User input in template source | SSTI: `{{7*7}}` returns `49` | Pass input as variables; sandbox for user templates |
| `set` inside a loop | Value is lost after the loop | `namespace()` or compute in Python |
| Whitespace in YAML / Markdown | Broken indentation, extra blank lines | `trim_blocks`, `lstrip_blocks`, check the parsed output |
| Final newline lost | Diffs on every generated file | `keep_trailing_newline=True` |
| `{{ d.items }}` on dicts | Prints a method, not the value | `{{ d["items"] }}` |
| Non-deterministic data | Flaky snapshot tests | Fixed input, frozen time, sorted collections |
| Heavy logic in templates | Hard to test, slow to render | Move logic to Python, test functions directly |

## Checklist

- [ ] Tests use the production environment factory
- [ ] Every template compiles in CI (`list_templates()` + `get_template()`)
- [ ] Happy path, empty state, missing variable and escaping are tested
- [ ] Prompt templates have contract tests (`meta.find_undeclared_variables`) and a golden file
- [ ] Snapshots use fixed data and are reviewed in PRs
- [ ] Custom filters have unit tests
- [ ] HTML templates pass djLint; other outputs are parsed after rendering

---
## See also
- [Jinja — Templates for Python](./index.md)
- [Jinja — QA Recipes](./04-qa-recipes.md)
- [Jinja — Filters, Escaping & Security](./03-customization-security.md)
- [Pytest](../pytest/index.md)
- [Code Quality](../code-quality/index.md)
- [LLM Evaluation](../../llm-evaluation/index.md)
