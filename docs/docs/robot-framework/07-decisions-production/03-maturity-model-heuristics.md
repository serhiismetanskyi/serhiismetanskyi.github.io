---
date: 2026-08-02
tags:
  - robot-framework
  - test-automation
---

# Maturity Model & Engineering Heuristics

Use this as a conversation tool with leadership: where you are today, what the next investment buys, and which practices separate “scripts on a laptop” from an **owned automation product**.

## Five-level maturity model

| Level | Name | Characteristics |
|-------|------|-----------------|
| 1 | Basic | Individual `.robot` files, ad-hoc structure, little reuse |
| 2 | Structured | Organized keywords, shared `resources/`, naming conventions |
| 3 | Layered | Clear layers (tests → domain → service → infra), custom Python libraries |
| 4 | Optimized | API-first coverage, Pabot/parallel CI, fast feedback loops |
| 5 | Enterprise | Framework team, observability (duration, flake), governance, onboarding |

## How to progress (actionable transitions)

| From → To | Concrete steps |
|-----------|----------------|
| 1 → 2 | Introduce `resources/`; ban copy-paste URLs; standard `Settings` per suite type |
| 2 → 3 | Add Python library for HTTP/DB; split “domain” vs “technical” keywords |
| 3 → 4 | Tag strategy (`smoke`, `api`, `e2e`); Pabot in CI; split jobs by folder |
| 4 → 5 | Dashboards for flake rate and runtime; RFC process for breaking keyword changes; new-hire guide |

## Engineering heuristics (staff / senior)

1. Prefer **API tests over UI**—aim for a **90/10** split unless regulation or risk dictates otherwise.
2. **Separate layers strictly**; no “just this once” HTTP call in a UI keyword.
3. Build a **reusable service layer** (auth, retries, logging) consumed by keywords.
4. Keep tests **simple**—**no business rules** in `.robot`; encode rules in libraries.
5. **Optimize for maintainability** over raw test count; delete low-value duplicates.
6. Treat the framework as a **product**: backlog, owners, SLAs for broken builds.
7. Use **custom Python libraries** for crypto, parsing, multi-step protocols.
8. Design keywords for **business readability** (`Checkout With Saved Card`), not widget clicks.
9. **Invest in CI/CD early**: artifacts, junit/XML output, deterministic environments.
10. **Monitor health**: flakiness rate, p95 duration, failures by tag/service.

## Security testing integration

| Area | Robot-friendly approach | Example focus |
|------|-------------------------|---------------|
| Auth | Negative cases via service keywords | Expired token, wrong role, missing scope |
| Input validation | API payloads at boundaries | Oversized fields, injection strings (in safe env) |
| Rate limiting | Scripted sequences + assertions on 429 | Document as non-load test (low volume) |

```robot
*** Test Cases ***
Rejects Request Without Bearer Token
    ${resp}=    GET On Session    service    /profile    expected_status=401
```

Keep **security scanning** (deps, containers) in dedicated tools; Robot proves **behavioral** checks.

## Performance testing strategy

Robot validates **functional** behavior under controlled data. **Load and soak** belong in [Locust](https://locust.io/) or k6.

| Concern | Tooling | Integration idea |
|---------|---------|------------------|
| Throughput / latency under load | Locust, k6 | CI stage publishes HTML/JSON; link in release notes |
| Single-request SLA smoke | Robot + timers in library | Optional thresholds; don’t confuse with load test |

## Framework as a product

| Practice | Outcome |
|----------|---------|
| Versioned releases of `automation-lib` | Consumers pin versions; breaking changes are visible |
| CHANGELOG + migration notes | Reduces silent breakage across teams |
| Onboarding doc (30-minute path) | Faster hires; less tribal knowledge |
| Office hours / guild | Shared standards without bottlenecks |

```text
docs/automation/
  onboarding.md
  conventions.md
libs/
  mycompany_keywords/   # versioned package
```

## Closing checklist

- [ ] Maturity level agreed with stakeholders  
- [ ] Next transition has **one** measurable outcome (e.g. “PR job under 15 minutes”)  
- [ ] Security and performance boundaries documented  
- [ ] Framework backlog visible next to product backlog  
