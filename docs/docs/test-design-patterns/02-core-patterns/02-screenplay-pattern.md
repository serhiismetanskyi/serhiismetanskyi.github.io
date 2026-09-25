---
date: 2026-07-11
tags:
  - test-automation
  - design-patterns
---

# Screenplay Pattern

## Concept

Screenplay models tests as actors performing tasks using abilities, rather than pages owning actions.

```
Actor  →  perform(Task)  →  Interaction  →  Browser / API
Actor  →  ask(Question)  →  Interaction  →  Browser / API
```

Three building blocks:

| Block | Role |
|---|---|
| **Actor** | Named persona (e.g. `Alice`) with abilities |
| **Task** | High-level user goal (e.g. `Login`, `PlaceOrder`) |
| **Interaction** | Low-level browser/API call (e.g. `Click`, `Enter`) |
| **Question** | Read state to assert on (e.g. `CurrentUrl`, `PageTitle`) |
| **Ability** | What the actor can do (e.g. `BrowseTheWeb`, `CallAnAPI`) |

---

## Structure

### Ability

```python
class BrowseTheWeb:
    def __init__(self, page: Page) -> None:
        self.page = page

    @classmethod
    def using(cls, page: Page) -> "BrowseTheWeb":
        return cls(page)
```

### Interaction

```python
class Click:
    def __init__(self, locator: str) -> None:
        self._locator = locator

    def perform_as(self, actor: "Actor") -> None:
        actor.ability(BrowseTheWeb).page.click(self._locator)
```

### Task

```python
class Login:
    def __init__(self, username: str, password: str) -> None:
        self._username = username
        self._password = password

    def perform_as(self, actor: "Actor") -> None:
        actor.perform(
            Enter.the_value(self._username).into('[data-testid="username"]'),
            Enter.the_value(self._password).into('[data-testid="password"]'),
            Click('[data-testid="submit"]'),
        )
```

### Actor

```python
class Actor:
    def __init__(self, name: str) -> None:
        self.name = name
        self._abilities: dict = {}

    def can(self, *abilities) -> "Actor":
        for ability in abilities:
            self._abilities[type(ability)] = ability
        return self

    def ability(self, ability_type: type):
        return self._abilities[ability_type]

    def perform(self, *tasks) -> None:
        for task in tasks:
            task.perform_as(self)

    def ask(self, question) -> any:
        return question.answered_by(self)
```

### Test

```python
def test_login_success(page: Page) -> None:
    alice = Actor("Alice").can(BrowseTheWeb.using(page))
    alice.perform(Login("alice@example.com", "secret"))
    assert alice.ask(CurrentUrl()) == "/dashboard"
```

---

## Benefits vs Page Object Model

| Criterion | POM | Screenplay |
|---|---|---|
| Reusability | Page-level | Task / Interaction level |
| Readability | Action names on pages | Intent-driven task names |
| Composability | Limited | High — tasks compose tasks |
| Complexity | Lower | Higher initial setup |
| Parallel safety | Per-page instance | Per-actor instance |

---

## When to Use

| Scenario | Use Screenplay |
|---|---|
| Large test suite with many shared flows | Yes |
| Multiple actor types (admin, user, guest) | Yes |
| Tests need to read like business requirements | Yes |
| Small project with 10–20 tests | No — POM is sufficient |
| API-only testing | No |

---

## Risks

| Risk | Mitigation |
|---|---|
| Over-abstraction for simple flows | Use POM or direct calls for trivial tests |
| Verbose setup for each actor | Shared actor builder fixtures |
| Deep call stack makes debugging hard | Log each interaction in `perform_as` |
