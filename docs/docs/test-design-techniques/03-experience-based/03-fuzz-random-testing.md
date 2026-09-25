---
date: 2026-07-09
tags:
  - testing
  - test-design
---

# Fuzz & Random Testing

## Concept

Fuzz testing sends unexpected, random, or malformed data to a system to expose crashes,
unhandled exceptions, and behaviour nobody thought to check manually.

Random testing generates inputs without structure.
Fuzzing generates inputs with structured mutations designed to trigger edge cases.

```
Random input → System → Did it crash? → Unexpected output? → Security issue?
```

---

## What Fuzz Testing Finds

- Crashes on unusual characters (null bytes, Unicode, emojis, control characters)
- Unhandled exceptions on edge-case lengths (0, 1, max, max+1)
- Type errors on unexpected input types
- Security vulnerabilities: injection, overflow, format string bugs
- Off-by-one errors that BVA misses if boundary isn't known

---

## Basic Fuzz with `pytest`

```python
import random
import string

import pytest


def process_input(data: str) -> str:
    if not data:
        raise ValueError("Empty input")
    if len(data) > 1000:
        raise ValueError("Input too long")
    return data.strip().lower()


class TestFuzzInput:
    @pytest.mark.parametrize("_attempt", range(20))
    def test_random_strings_dont_crash(self, _attempt: int) -> None:
        length = random.randint(1, 500)
        data = "".join(random.choices(string.printable, k=length))
        result = process_input(data)
        assert isinstance(result, str)

    def test_unicode_input(self) -> None:
        result = process_input("Тест 日本語 data")
        assert isinstance(result, str)

    def test_whitespace_only(self) -> None:
        result = process_input("   \t\n   ")
        assert result == ""

    def test_boundary_length(self) -> None:
        result = process_input("a" * 1000)
        assert len(result) == 1000

    def test_over_boundary_raises(self) -> None:
        with pytest.raises(ValueError, match="too long"):
            process_input("a" * 1001)

    def test_empty_input_raises(self) -> None:
        with pytest.raises(ValueError, match="Empty"):
            process_input("")
```

---

## Property-Based Testing with `hypothesis`

`hypothesis` is smarter than random — it generates minimal failing examples and shrinks them.

```python
from hypothesis import given, settings, strategies as st


@given(st.text(min_size=0, max_size=1500))
@settings(max_examples=200)
def test_process_input_contract(data: str) -> None:
    if not data or len(data) > 1000:
        with pytest.raises(ValueError):
            process_input(data)
    else:
        result = process_input(data)
        assert result is not None
        assert isinstance(result, str)


@given(st.text(min_size=1, max_size=1000))
def test_valid_input_always_produces_lowercase(data: str) -> None:
    result = process_input(data)
    assert result == result.lower()
```

---

## Targeted Fuzz Cases

Beyond random, always include known-difficult inputs:

| Category | Examples |
|----------|---------|
| Empty / whitespace | `""`, `" "`, `"\t\n"` |
| Max length | `"a" * 1000`, `"a" * 1001` |
| Unicode | `"日本語"`, `"Ñoño"`, `"مرحبا"` |
| Special chars | `"'; DROP TABLE--"`, `"<script>"`, `"../../../"` |
| Null bytes | `"\x00"`, `"data\x00more"` |
| Numbers as string | `"0"`, `"-1"`, `"9999999999"` |
| Control characters | `"\r"`, `"\n"`, `"\x1b"` |
| Homoglyphs | `"аdmin"` (Cyrillic а, not Latin a) |

---

## Fuzz vs Random vs Property-Based

| Approach | Input Generation | Shrinking | Best For |
|----------|-----------------|-----------|---------|
| Random parametrize | `random.choice` | No | Quick smoke coverage |
| Mutation fuzzing | Mutate known inputs | No | Parsing, protocols |
| `hypothesis` | Smart strategy-based | Yes | Logic invariants, regression |
| Security fuzzers (AFL, libFuzzer) | Coverage-guided | Yes | C/Rust, binary protocols |

---

## Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Non-deterministic failures | Random seed changes between runs | Log seed; use `hypothesis` which reproduces failures |
| Slow tests | 1000 random cases slow CI | Limit with `range(20)` or `@settings(max_examples=50)` |
| No assertion | Only checking "doesn't crash" | Add invariant assertions (type, length, format) |
| Missing important categories | Random misses known-dangerous inputs | Always add targeted cases alongside random ones |
