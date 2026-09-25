---
date: 2026-03-24
slug: test-design-stop-clicking-start-thinking
authors:
  - username
categories:
  - QA
tags:
  - qa
  - testing
  - test-design-technique
image: img/blog/test-design-stop-clicking-start-thinking.png
---

# Test Design: Stop Clicking, Start Thinking

Test design is one of those things where you can quickly see if a QA is really thinking or just clicking through a checklist.

<!-- more -->

The funny part is that many people remember these techniques only before a job interview. They review BVA, equivalence, decision tables… say the right words… and then forget everything in real work. Back to “clicked around, nothing broke, looks fine”.

But test design is not for interviews. It’s for everyday work, so you don’t find problems only after release.

In real life, testing in many teams looks like this: a bit of manual testing, some autotests somewhere in CI, and a hope that nothing serious breaks. It works… until it doesn’t. Then some strange case appears in production and nobody even thought to check it before.

So if we keep it simple, test design techniques are just ways to stop testing randomly and start testing with some logic. Here’s how each one looks in pytest — with examples close to what you’d see in a real codebase.

## Equivalence Partitioning

Don’t test every possible value. Split data into groups and take one representative from each. That’s it.

A typical scenario: a registration form accepts age between 18 and 65. Instead of checking every number from 0 to 200, the data gets split into valid and invalid classes. One test per class is enough.

```python
import pytest

def validate_age(age: int) -> str:
    if age < 18:
        return "too_young"
    if age > 65:
        return "too_old"
    return "valid"

@pytest.mark.parametrize("age, expected", [
    (25, "valid"),       # valid class: 18-65
    (10, "too_young"),   # invalid class: < 18
    (70, "too_old"),     # invalid class: > 65
])
def test_age_equivalence_partitioning(age, expected):
    assert validate_age(age) == expected
```

Three tests instead of hundreds. Each one covers a whole class of inputs. That’s the point — one value represents the entire group. A QA who writes 50 tests for the same class is wasting everyone’s time.

## Boundary Value Analysis

Most bugs live on the edges. Minimum, maximum, and values right next to them. If someone skips borders, they’ll probably miss real issues.

For the same age field (18–65), BVA says: test 17, 18, 19, 64, 65, 66. That’s where off-by-one errors hide. The developer writes age > 18 instead of age >= 18 — BVA catches it. Every single time.

```python
import pytest

def validate_age(age: int) -> str:
    if age < 18:
        return "too_young"
    if age > 65:
        return "too_old"
    return "valid"

@pytest.mark.parametrize("age, expected", [
    (17, "too_young"),  # min - 1
    (18, "valid"),      # min (boundary)
    (19, "valid"),      # min + 1
    (64, "valid"),      # max - 1
    (65, "valid"),      # max (boundary)
    (66, "too_old"),    # max + 1
])
def test_age_boundary_values(age, expected):
    assert validate_age(age) == expected
```

It’s boring. It’s repetitive. And it catches bugs that clever exploratory testing misses entirely. The six values on the boundary are worth more than twenty random values in the middle of the range.

## Decision Table Testing

When logic gets complex — multiple conditions, multiple outcomes — a decision table saves everyone from going insane trying to remember all the rules.

Say there’s a discount system: VIP customers get better deals, and orders above $1000 get extra discount. Four rules, four outcomes. Nothing fancy, but if someone misses rule 3, the non-VIP customer with a big order gets zero discount and complains to support.

```python
import pytest

def calculate_discount(is_vip: bool, amount: float) -> int:
    if is_vip and amount > 1000:
        return 20
    if is_vip:
        return 10
    if amount > 1000:
        return 5
    return 0

@pytest.mark.parametrize("is_vip, amount, expected_discount", [
    (True, 1500, 20),   # Rule 1: VIP + high amount
    (True, 500, 10),    # Rule 2: VIP + low amount
    (False, 1500, 5),   # Rule 3: not VIP + high amount
    (False, 500, 0),    # Rule 4: not VIP + low amount
])
def test_discount_decision_table(is_vip, amount, expected_discount):
    assert calculate_discount(is_vip, amount) == expected_discount
```

The table makes it obvious. No hidden combinations, no “wait, what happens if…” moments during code review. Every combination is right there. And pytest.mark.parametrize turns the table directly into tests — one line per rule.

## State Transition Testing

For flows with steps and states. Not just one action, but a sequence. What happens when a user goes back, refreshes, or skips steps entirely?

Classic example: an order goes through states — pending, confirmed, shipped, delivered. Each transition has rules. An order can’t jump from pending to delivered. A delivered order can’t go back to pending. These things seem obvious until someone finds a way to break them in production.

```python
class Order:
    TRANSITIONS = {
        "pending": ["confirmed", "cancelled"],
        "confirmed": ["shipped", "cancelled"],
        "shipped": ["delivered"],
        "delivered": [],
        "cancelled": [],
    }

    def __init__(self):
        self.state = "pending"

    def transition(self, new_state: str) -> bool:
        if new_state in self.TRANSITIONS[self.state]:
            self.state = new_state
            return True
        return False

class TestOrderStateTransition:
    def test_valid_full_flow(self):
        order = Order()
        assert order.transition("confirmed")
        assert order.transition("shipped")
        assert order.transition("delivered")
        assert order.state == "delivered"

    def test_cannot_ship_pending_order(self):
        order = Order()
        assert not order.transition("shipped")
        assert order.state == "pending"

    def test_cannot_reverse_delivered(self):
        order = Order()
        order.transition("confirmed")
        order.transition("shipped")
        order.transition("delivered")

        assert not order.transition("pending")
    def test_cancel_from_pending(self):
        order = Order()
        assert order.transition("cancelled")
        assert order.state == "cancelled"

    def test_cancel_from_confirmed(self):
        order = Order()
        order.transition("confirmed")
        assert order.transition("cancelled")
        assert order.state == "cancelled"

    def test_cannot_cancel_after_shipped(self):
        order = Order()
        order.transition("confirmed")
        order.transition("shipped")
        assert not order.transition("cancelled")
```

State machines look boring on paper. In reality they catch entire categories of bugs — the kind where an order somehow ends up in an impossible state and three teams spend a Friday evening figuring out how it happened. State transition tests prevent that Friday.

## CRUD Testing

Check create, read, update, delete. And make sure data is correct after every action, not only after creation.

It sounds trivial, but the amount of times “delete” works in the UI while the record is still sitting in the database… is embarrassing. Or when “update” changes the name but silently resets the email to null. CRUD testing is about the full lifecycle, not just happy path creation.

```python
import pytest

class UserStorage:
    def __init__(self):
        self._users = {}

    def create(self, user_id: str, name: str) -> dict:
        if user_id in self._users:
            raise ValueError("User already exists")
        self._users[user_id] = {"id": user_id, "name": name}
        return self._users[user_id]

    def read(self, user_id: str) -> dict:
        if user_id not in self._users:
            raise KeyError("User not found")
        return self._users[user_id]

    def update(self, user_id: str, name: str) -> dict:
        if user_id not in self._users:
            raise KeyError("User not found")
        self._users[user_id]["name"] = name
        return self._users[user_id]

    def delete(self, user_id: str) -> bool:
        if user_id not in self._users:
            raise KeyError("User not found")
        del self._users[user_id]
        return True

class TestCRUD:
    def setup_method(self):
        self.storage = UserStorage()

    def test_create_and_read(self):
        self.storage.create("1", "Alice")
        assert self.storage.read("1")["name"] == "Alice"

    def test_update_changes_data(self):
        self.storage.create("1", "Alice")
        self.storage.update("1", "Bob")
        assert self.storage.read("1")["name"] == "Bob"

    def test_delete_removes_record(self):
        self.storage.create("1", "Alice")
        self.storage.delete("1")
        with pytest.raises(KeyError):
            self.storage.read("1")

    def test_create_duplicate_raises(self):
        self.storage.create("1", "Alice")
        with pytest.raises(ValueError):
            self.storage.create("1", "Alice")

    def test_full_lifecycle(self):
        self.storage.create("1", "Alice")
        assert self.storage.read("1")["name"] == "Alice"
        self.storage.update("1", "Bob")
        assert self.storage.read("1")["name"] == "Bob"
        self.storage.delete("1")
        with pytest.raises(KeyError):
            self.storage.read("1")
```

The trick with CRUD is testing after each operation, not just at the end. Create it, read it back immediately. Update it, read it again. Delete it, try to read once more. That’s where the sneaky data integrity bugs live.

## Metamorphic Testing

When there is no exact expected result. You don’t check one answer — you check if results are consistent when input changes.

This one is underrated. It’s perfect for search, sorting, ML outputs — anything where you can’t easily hardcode the expected result, but you know the relationship between inputs and outputs. ISTQB added it to the Advanced Level in 2025, which says something about where the industry is heading.

```python
def search_products(query: str, catalog: list[str]) -> list[str]:
    return [p for p in catalog if query.lower() in p.lower()]

CATALOG = ["Python Book", "Java Guide", "Python Course", "Go Manual"]

class TestMetamorphicSearch:
    def test_narrower_query_returns_subset(self):
        broad = search_products("Python", CATALOG)
        narrow = search_products("Python Book", CATALOG)
        assert all(item in broad for item in narrow)
        assert len(narrow) <= len(broad)

    def test_case_insensitivity(self):
        lower = search_products("python", CATALOG)
        upper = search_products("PYTHON", CATALOG)
        assert lower == upper

    def test_larger_catalog_keeps_old_results(self):
        original = search_products("Python", CATALOG)
        extended = [*CATALOG, "Rust Handbook"]
        new_results = search_products("Python", extended)
        assert all(item in new_results for item in original)

    def test_empty_query_returns_all(self):
        result = search_products("", CATALOG)
        assert result == CATALOG
```

Nobody memorizes what exact output the search should return for every possible query. But everybody knows: if the query is more specific, the results should be a subset. If the catalog grows, old results shouldn’t disappear. That’s metamorphic testing — checking relationships, not exact values.

## Pairwise Testing

When there are many parameters and too many combinations. This technique reduces the number of tests while still covering every pair of parameter values.

Testing a web app across 3 browsers, 3 operating systems, and 2 languages? That’s 18 full combinations. Pairwise brings it down to about 9 while still covering every pair. The math says most defects are caused by interactions between two parameters, not three or four. So covering all pairs is usually good enough.

```python
import pytest

PAIRWISE_CASES = [
    ("Chrome", "Windows", "EN"),
    ("Chrome", "Mac", "UA"),
    ("Chrome", "Linux", "EN"),
    ("Firefox", "Windows", "UA"),
    ("Firefox", "Mac", "EN"),
    ("Firefox", "Linux", "UA"),
    ("Safari", "Windows", "EN"),
    ("Safari", "Mac", "UA"),
    ("Safari", "Linux", "EN"),
]

def check_compatibility(browser: str, os_name: str, lang: str) -> bool:
    return bool(browser and os_name and lang)

@pytest.mark.parametrize("browser, os_name, lang", PAIRWISE_CASES)
def test_pairwise_compatibility(browser, os_name, lang):
    assert check_compatibility(browser, os_name, lang)
```

Full exhaustive testing would need 18 cases. Pairwise gives 9 and still catches most interaction bugs. Tools like allpairspy can generate these combinations automatically, but even hand-picking pairs from a table works for small sets. The point is reducing test count without losing meaningful coverage.

## Random and Fuzz Testing

Send random or broken data to the system. It helps find crashes, unhandled exceptions, and unexpected behavior that nobody thought to check manually.

The thing about fuzz testing — it finds bugs no human would think to test. Unicode in a name field? Negative float as age? A string that’s technically valid JSON but contains 10MB of nested brackets? Fuzz testing doesn’t care about conventions, it just throws data and watches what breaks.

```python
import pytest
import random
import string

def process_input(data: str) -> str:
    if not data:
        raise ValueError("Empty input")
    if len(data) > 1000:
        raise ValueError("Input too long")
    return data.strip().lower()

class TestFuzzInput:
    @pytest.mark.parametrize("_attempt", range(20))
    def test_random_strings_dont_crash(self, _attempt):
        length = random.randint(1, 500)
        data = "".join(random.choices(string.printable, k=length))
        result = process_input(data)
        assert isinstance(result, str)

    def test_unicode_input(self):
        result = process_input("Тест 日本語 data")
        assert isinstance(result, str)

    def test_whitespace_only(self):
        result = process_input("   \t\n   ")
        assert result == ""

    def test_boundary_length(self):
        result = process_input("a" * 1000)
        assert len(result) == 1000

    def test_over_boundary_raises(self):
        with pytest.raises(ValueError, match="too long"):
            process_input("a" * 1001)

    def test_empty_input_raises(self):
        with pytest.raises(ValueError, match="Empty"):
            process_input("")
```

Nobody writes “test with 500 random printable characters” during sprint planning. But when fuzz testing crashes on attempt 17 with some weird mix of tabs and control characters — that’s a real bug nobody would have found otherwise. Hypothesis library takes this even further with property-based testing, but even simple random parametrize already catches more than you’d expect.

## So What

It all sounds like basic theory, but in reality it’s just normal working practice. Fewer useless tests, more meaningful checks.

The honest truth is: most teams don’t use half of these techniques. Not because they’re hard, but because there’s always a sprint, always a deadline, always “we’ll add proper tests later.” That “later” rarely comes.

But when these techniques are used every day — not only for interviews — testing becomes stronger and releases become less painful. An engineer who looks at a feature spec and immediately thinks “okay, these are my equivalence classes, these are my boundaries, here’s the state machine” — that person catches bugs the rest of the team doesn’t even know exist.

The tools are right there. pytest.mark.parametrize alone covers half of these patterns. Decision tables become parametrize matrices. Boundaries become parametrize lists. State machines become test classes with setup methods.

Stop clicking. Start thinking.
