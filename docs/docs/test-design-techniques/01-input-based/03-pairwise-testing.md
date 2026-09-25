---
date: 2026-07-07
tags:
  - testing
  - test-design
---

# Pairwise Testing

## Concept

When there are many parameters with multiple values, exhaustive testing is impractical.
Pairwise testing covers every possible **pair** of parameter values with the minimum number of test cases.

The empirical observation behind pairwise: most defects are triggered by interactions between
**two** parameters, not three or more. Covering all pairs catches the majority of bugs.

---

## The Combinatorial Problem

| Parameters | Values each | Exhaustive tests | Pairwise tests |
|------------|------------|-----------------|----------------|
| 3 | 3 | 27 | 9 |
| 4 | 3 | 81 | 9–12 |
| 5 | 3 | 243 | 12–15 |
| 10 | 3 | 59,049 | ~17 |

---

## Example: Browser / OS / Language Matrix

3 browsers × 3 OS × 2 languages = 18 exhaustive combinations.
Pairwise reduces to ~9 while covering all pairs.

```python
import pytest

PAIRWISE_CASES = [
    ("Chrome",  "Windows", "EN"),
    ("Chrome",  "Mac",     "UA"),
    ("Chrome",  "Linux",   "EN"),
    ("Firefox", "Windows", "UA"),
    ("Firefox", "Mac",     "EN"),
    ("Firefox", "Linux",   "UA"),
    ("Safari",  "Windows", "EN"),
    ("Safari",  "Mac",     "UA"),
    ("Safari",  "Linux",   "EN"),
]


def check_compatibility(browser: str, os_name: str, lang: str) -> bool:
    return bool(browser and os_name and lang)


@pytest.mark.parametrize("browser, os_name, lang", PAIRWISE_CASES)
def test_pairwise_compatibility(browser: str, os_name: str, lang: str) -> None:
    assert check_compatibility(browser, os_name, lang)
```

Every (browser, OS) pair appears. Every (browser, lang) pair appears. Every (OS, lang) pair appears.

---

## Generating Pairwise Cases

### Manual (small sets)
Build a coverage matrix and fill greedily, ensuring each pair appears at least once.

### Automated with `allpairspy`

```python
from allpairspy import AllPairs

parameters = [
    ["Chrome", "Firefox", "Safari"],
    ["Windows", "Mac", "Linux"],
    ["EN", "UA"],
]

cases = list(AllPairs(parameters))
# Each element is a list: ["Chrome", "Windows", "EN"]
```

---

## When to Use Pairwise

| Scenario | Use Pairwise |
|----------|-------------|
| Cross-browser / cross-OS / cross-locale | Yes |
| Feature flags with multiple toggles | Yes |
| Config combinations (DB engine, cache, queue) | Yes |
| Simple 2-parameter interaction | No — use exhaustive |
| Single parameter with many values | No — use EP + BVA |

---

## Pairwise vs Exhaustive

| Criterion | Exhaustive | Pairwise |
|-----------|-----------|---------|
| Coverage | All combinations | All pairs |
| Test count | Exponential | Near-linear |
| Bug detection | 100% | ~85–90% |
| Practical for 5+ params | No | Yes |

For most real-world compatibility and config testing, pairwise is the right trade-off.
Use exhaustive only when safety-critical or regulatory requirements demand it.

---

## Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| 3-way interaction bug | Bug needs 3 specific values together | Add targeted 3-way tests for known risky combos |
| Wrong pairwise tool output | Tool generates invalid pairs | Validate generated cases manually |
| Missing values | New value added without regenerating | Regenerate pairwise set when parameters change |
