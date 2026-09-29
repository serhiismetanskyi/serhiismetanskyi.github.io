---
date: 2026-09-29
tags:
  - python
  - libraries
  - jinja
  - test-automation
  - test-data
  - llm
  - pytest
---

# Jinja — QA Recipes

Each recipe uses a strict environment: `StrictUndefined`, `trim_blocks`, `lstrip_blocks`, `keep_trailing_newline`. Autoescape is on only for HTML and XML.

## Config Files per Environment

```yaml+jinja
{# templates/config/env.yaml.j2 #}
# Generated for {{ env_name }} — do not edit by hand.
base_url: {{ base_url | tojson }}
timeout: {{ timeout | default(30) }}
headless: {{ headless | tojson }}
users:
{% for u in users %}
  - login: {{ u.login | tojson }}
    role: {{ u.role | tojson }}
{% endfor %}
```

```python
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined

env = Environment(
    loader=FileSystemLoader("templates"),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=True,
)
ENVIRONMENTS = {
    "staging": {"base_url": "https://staging.example.com", "headless": True,
                "users": [{"login": "qa: admin", "role": "admin"}]},
    "local": {"base_url": "http://localhost:8000", "headless": False, "timeout": 5,
              "users": [{"login": "dev", "role": "admin"}]},
}

template = env.get_template("config/env.yaml.j2")
Path("config").mkdir(exist_ok=True)
for name, values in ENVIRONMENTS.items():
    text = template.render(env_name=name, **values)
    yaml.safe_load(text)                                   # fail here, not in the test run
    Path(f"config/{name}.yaml").write_text(text, encoding="utf-8")
```

Why `tojson` for every string: JSON is valid YAML, so quotes and escaping come for free. Without it, a value like `qa: admin` or a newline breaks the file or injects keys:

```python
bad = env.from_string("role: viewer\nuser: {{ name }}\n")
yaml.safe_load(bad.render(name="x\nrole: admin"))        # {'role': 'admin', 'user': 'x'} ← injected
good = env.from_string("role: viewer\nuser: {{ name | tojson }}\n")
yaml.safe_load(good.render(name="x\nrole: admin"))       # {'role': 'viewer', 'user': 'x\nrole: admin'}
```

If the config has a schema, load the rendered YAML into a Pydantic model — the template checks names, the model checks types and values.

## XML / SOAP Payloads with pytest

Large request bodies are easier to read as templates than as code. Autoescape for XML keeps special characters valid.

```xml+jinja
{# templates/payloads/order.xml.j2 #}
<?xml version="1.0" encoding="UTF-8"?>
<order id="{{ order_id }}">
  <customer>{{ customer }}</customer>
  {% for item in items %}
  <item sku="{{ item.sku }}" qty="{{ item.qty }}"/>
  {% endfor %}
</order>
```

```python
import xml.etree.ElementTree as ET

import pytest
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

env = Environment(
    loader=FileSystemLoader("templates/payloads"),
    autoescape=select_autoescape(["xml", "xml.j2"]),  # escape &, <, > and quotes in values
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)
ORDER = env.get_template("order.xml.j2")


@pytest.mark.parametrize(
    ("customer", "items"),
    [
        pytest.param("Alice", [{"sku": "A-1", "qty": 1}], id="single-item"),
        pytest.param("Tom & Jerry <Ltd>", [{"sku": "B-2", "qty": 3}], id="xml-special-chars"),
        pytest.param("Bob", [], id="empty-order"),
    ],
)
def test_order_payload_is_valid_xml(customer, items):
    body = ORDER.render(order_id=42, customer=customer, items=items)
    root = ET.fromstring(body.encode())
    assert root.findtext("customer") == customer
    assert len(root.findall("item")) == len(items)
    # in a real test: api.post("/orders", content=body, headers={"Content-Type": "application/xml"})
```

For JSON bodies, do not use templates — build a dict (or a Pydantic model) and let the HTTP client serialize it.

## Test Reports from JUnit XML

pytest writes JUnit XML with `--junitxml=junit.xml`. Parse it into simple objects, then render HTML for people and Markdown for CI.

```python
# reporting.py
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape


@dataclass
class CaseResult:           # not "TestResult": pytest would try to collect Test* classes
    nodeid: str
    status: str             # passed | failed | skipped
    duration: float
    message: str = ""


@dataclass
class Run:
    name: str
    tests: list[CaseResult] = field(default_factory=list)

    def _count(self, status: str) -> int:
        return sum(t.status == status for t in self.tests)

    total = property(lambda self: len(self.tests))
    passed = property(lambda self: self._count("passed"))
    failed = property(lambda self: self._count("failed"))
    skipped = property(lambda self: self._count("skipped"))
    duration = property(lambda self: sum(t.duration for t in self.tests))


def load_junit(path: Path, name: str) -> Run:
    tests = []
    for case in ET.parse(path).getroot().iter("testcase"):
        status, message = "passed", ""
        for tag in ("failure", "error", "skipped"):
            node = case.find(tag)
            if node is not None:
                status = "skipped" if tag == "skipped" else "failed"
                message = node.get("message", "")
                break
        nodeid = f"{case.get('classname')}::{case.get('name')}"
        tests.append(CaseResult(nodeid, status, float(case.get("time", 0)), message))
    return Run(name, tests)


def duration(seconds: float) -> str:
    return str(timedelta(seconds=round(seconds)))


def make_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(Path(__file__).parent / "templates"),
        autoescape=select_autoescape(["html", "html.j2", "xml"]),   # .md.j2 stays unescaped
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )
    env.filters["duration"] = duration
    return env
```

```html+jinja
{# templates/report.html.j2 #}
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>{{ run.name }} — {{ run.passed }}/{{ run.total }} passed</title></head>
<body>
<h1>{{ run.name }}</h1>
<p>Duration: {{ run.duration | duration }}</p>
<table>
  <tr><th>Test</th><th>Status</th><th>Time</th></tr>
  {% for t in run.tests | sort(attribute="status") %}
  <tr class="{{ t.status }}">
    <td>{{ t.nodeid }}</td>
    <td>{{ t.status | upper }}</td>
    <td>{{ "%.2f" | format(t.duration) }}s</td>
  </tr>
  {% if t.message %}
  <tr><td colspan="3"><pre>{{ t.message }}</pre></td></tr>
  {% endif %}
  {% endfor %}
</table>
</body>
</html>
```

```jinja
{# templates/summary.md.j2 #}
## {{ "PASS" if run.failed == 0 else "FAIL" }} — {{ run.name }}

| Total | Passed | Failed | Skipped |
|------:|-------:|-------:|--------:|
| {{ run.total }} | {{ run.passed }} | {{ run.failed }} | {{ run.skipped }} |
{% set failures = run.tests | selectattr("status", "equalto", "failed") | list %}
{% if failures %}

### Failures

{% for t in failures %}
- `{{ t.nodeid }}` — {{ t.message | truncate(120) }}
{% endfor %}
{% endif %}
```

```python
# render_report.py — run after: pytest --junitxml=junit.xml
import os
from pathlib import Path

from reporting import load_junit, make_env

run = load_junit(Path("junit.xml"), name="API smoke")
env = make_env()
Path("report.html").write_text(env.get_template("report.html.j2").render(run=run), encoding="utf-8")

summary = env.get_template("summary.md.j2").render(run=run)
if step_summary := os.environ.get("GITHUB_STEP_SUMMARY"):          # GitHub Actions job summary
    with open(step_summary, "a", encoding="utf-8") as f:
        f.write(summary)
print(summary)
```

Assertion messages from failed tests often contain `<` and `>` (`assert <Response [500]> ...`). Autoescape makes the HTML report show them as text instead of breaking the page — and a test for that is in [05](./05-testing-templates.md#rendering-tests).

## LLM Prompt Templates

Keep prompts in files, not in f-strings: they are reviewed in diffs, versioned and tested like other templates.

```jinja
{# templates/prompts/triage.j2 #}
You are a QA triage assistant for {{ product }}.
Classify each bug report as one of: {{ labels | join(", ") }}.
Answer with JSON only: {"id": <id>, "label": <label>}.
{% if examples %}

Examples:
{% for ex in examples %}
- Report: {{ ex.text | tojson }} -> {{ {"id": ex.id, "label": ex.label} | tojson }}
{% endfor %}
{% endif %}

Reports:
{% for r in reports %}
<report id="{{ r.id }}">
{{ r.text | trim }}
</report>
{% endfor %}
```

```python
# prompts.py
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

PROMPTS = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates" / "prompts"),
    undefined=StrictUndefined,   # a missing variable is an error, not an empty string
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=True,
    autoescape=False,            # plain text, not HTML
)


def render_prompt(name: str, **context) -> str:
    return PROMPTS.get_template(f"{name}.j2").render(**context)


prompt = render_prompt(
    "triage",
    product="Checkout",
    labels=["bug", "feature", "question"],
    examples=[{"id": 0, "text": "Pay button does nothing", "label": "bug"}],
    reports=[{"id": 1, "text": "Can you add Apple Pay?"}, {"id": 2, "text": "Total shows {{ 7*7 }}"}],
)
# ...<report id="2">\nTotal shows {{ 7*7 }}\n</report> — user text is data, never evaluated
```

Prompt rules:

- User and retrieved text goes in as **variables**, never into the template source.
- Wrap untrusted text in clear delimiters (`<report>`, `<document>`) — it helps the model separate data from instructions, but it is not a security control against prompt injection.
- Literal braces in a prompt (`{"id": <id>}`) are fine — only `{{`, `{%`, `{#` start Jinja syntax.
- The same idea exists in frameworks: LangChain `PromptTemplate(..., template_format="jinja2")`, Hugging Face chat templates (`tokenizer.chat_template`). Use Jinja formats only with templates you control.

Tests for this prompt are in [05](./05-testing-templates.md#llm-prompt-tests).

## Generating pytest Modules

Usually `@pytest.mark.parametrize` over data from YAML/JSON is enough. Generate test **code** only when you need real, reviewable test functions — for example from an OpenAPI or endpoint list, committed to the repo.

```jinja
{# codegen/test_endpoints.py.j2 #}
# Generated from {{ spec_name }} — do not edit by hand.
import pytest
{% for ep in endpoints %}


@pytest.mark.{{ ep.get("marker", "smoke") }}
def test_{{ ep.name }}(api):
    response = api.request({{ ep.method | py }}, {{ ep.path | py }})
    assert response.status_code in {{ ep.expected | py }}
{% endfor %}
```

```python
# gen_tests.py
import ast
from pathlib import Path

import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined

env = Environment(
    loader=FileSystemLoader("codegen"),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=True,
)
env.filters["py"] = repr  # Python literals: True/None, not JSON true/null

spec = Path("endpoints.yaml")   # - {name: list_users, method: GET, path: /users, expected: [200]}
code = env.get_template("test_endpoints.py.j2").render(
    spec_name=spec.name,
    endpoints=yaml.safe_load(spec.read_text()),
)
ast.parse(code)  # fail fast if the template produced invalid Python
Path("tests_generated").mkdir(exist_ok=True)
Path("tests_generated/test_endpoints.py").write_text(code, encoding="utf-8")
```

Run `ruff format tests_generated` after generation (the `repr` quotes are single quotes), and check in CI that regenerating produces no diff. Names from the spec go into identifiers — validate them (`str.isidentifier()`) before rendering.

## Jinja Inside YAML (Ansible Style)

In Ansible, the YAML file is parsed **first**, and Jinja expressions inside string values are rendered later. That order causes the usual errors:

```python
yaml.safe_load("url: {{ base_url }}")          # ConstructorError — YAML sees a {…} mapping
yaml.safe_load("url: {{ base_url }}/api")      # ParserError
yaml.safe_load('url: "{{ base_url }}/api"')    # {'url': '{{ base_url }}/api'} — a string for Jinja
```

| Caveat | What to do |
|--------|------------|
| Value starts with `{{` | Quote the whole value: `url: "{{ base_url }}/api"` |
| Literal `{{ }}` needed in the result | `{% raw %}...{% endraw %}` or Ansible's `!unsafe` tag |
| Conditions | `when: env_name == "prod"` — `when` is already an expression, no `{{ }}` |
| Optional module arguments | Filter `default(omit)` on the value — Ansible's `omit` drops the argument when the variable is undefined |
| Templated YAML files (`template` module, `.yaml.j2`) | Rendered **before** parsing — use `tojson` / `to_nice_yaml` for values, as in the first recipe |
| Different engine settings | Ansible, dbt and Salt configure their own Jinja environment and filters — test there, not with plain `jinja2` |

The same "parse, then render string values" pattern works in your own tools:

```python
data = yaml.safe_load('base_url: https://staging\nhealth: "{{ base_url }}/health"')
env = Environment(undefined=StrictUndefined)
{key: env.from_string(value).render(**data) for key, value in data.items()}
# {'base_url': 'https://staging', 'health': 'https://staging/health'}
```

## Checklist

- [ ] Rendered configs are parsed (`yaml.safe_load`, `json.loads`, `ET.fromstring`, `ast.parse`) right after rendering
- [ ] String values in YAML/JSON templates go through `tojson`
- [ ] JSON request bodies are built as dicts, not templates
- [ ] HTML reports escape test output; Markdown summaries are not HTML-escaped
- [ ] Prompts live in template files with `StrictUndefined`; user text is passed as variables
- [ ] Generated test code is formatted, parsed and checked for regeneration drift in CI
- [ ] YAML values starting with `{{` are quoted

---
## See also
- [Jinja — Templates for Python](./index.md)
- [Jinja — Testing Templates](./05-testing-templates.md)
- [Pytest Playbook — Test Data Factories](../pytest/02-practical-playbooks/02-test-data-factories.md)
- [Pydantic](../pydantic/index.md)
- [LLM Evaluation — Prompts Optimization](../../llm-evaluation/03_practical/17_prompts_optimization.md)
