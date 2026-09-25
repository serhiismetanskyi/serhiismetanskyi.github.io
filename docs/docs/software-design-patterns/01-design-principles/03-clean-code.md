---
date: 2026-06-16
tags:
  - design-patterns
  - architecture
---

# Clean Code

Clean code is code that a new team member can read and understand without asking questions.
It is not about style preferences — it is about reducing cognitive load.

---

## Naming

Names should reveal intent. If a name needs a comment to explain it, the name is wrong.

```python
# Bad
def calc(x: list[float], d: int) -> float:
    return sum(x) / len(x) * (1 - d / 100)

# Good
def calculate_discounted_average(prices: list[float], discount_percent: int) -> float:
    average = sum(prices) / len(prices)
    return average * (1 - discount_percent / 100)
```

| Rule | Example |
|------|---------|
| Use intention-revealing names | `days_since_modified`, not `d` |
| Avoid disinformation | Don't name a `set` as `accountList` |
| Make meaningful distinctions | `user_input` vs `validated_input`, not `data1`/`data2` |
| Use pronounceable names | `generation_timestamp`, not `genymdhms` |
| Use searchable names | `MAX_RETRY_COUNT = 3`, not magic number `3` |

---

## Functions

A function should do **one thing**. If you can extract a part of it as a meaningful
named function, it's doing more than one thing.

```python
# Bad — does 3 things: validate, calculate, format
def process_order(order: dict) -> str:
    if order["qty"] <= 0:
        raise ValueError("Invalid quantity")
    total = order["qty"] * order["price"] * 1.2
    return f"Order total: ${total:.2f}"

# Good — each function has one responsibility
def validate_order(order: dict) -> None:
    if order["qty"] <= 0:
        raise ValueError("Invalid quantity")

def calculate_total_with_tax(qty: int, price: float, tax_rate: float = 0.2) -> float:
    return qty * price * (1 + tax_rate)

def format_order_summary(total: float) -> str:
    return f"Order total: ${total:.2f}"
```

**Rules:**
- Keep functions short (aim for < 20 lines)
- Fewer arguments is better (0–2 is ideal, 3 is a warning sign)
- No side effects — a function named `get_user` should not also send an email
- Command/Query Separation: a function either returns data or changes state, not both

---

## Comments

**Good comments** explain *why*, not *what*. The code explains what.

```python
# Bad — restates the code
# Increment counter by 1
counter += 1

# Good — explains non-obvious intent
# Retry count starts at -1 so the first attempt is counted as attempt 0
retry_count = -1

# Good — explains business rule
# VAT is applied only for EU customers per 2024 EU digital services directive
if customer.region == "EU":
    price *= 1.20
```

**Never use comments to compensate for bad code.** Refactor instead.

---

## Error Handling

Don't return `None` or error codes — raise exceptions with meaningful messages.

```python
# Bad
def find_user(user_id: int) -> dict | None:
    ...  # returns None if not found

# Good
class UserNotFoundError(Exception):
    pass

def find_user(user_id: int) -> dict:
    user = db.get(user_id)
    if user is None:
        raise UserNotFoundError(f"User {user_id} does not exist")
    return user
```

- Use specific exception types, not bare `except Exception`
- Log errors at the right level (`warning` for expected failures, `error` for unexpected)
- Fail fast — validate inputs at function entry, not deep in the call chain

---

## Code Structure

```python
# Bad — one giant function
def handle_checkout(cart_id: int) -> None:
    cart = db.get_cart(cart_id)
    if not cart or not cart["items"]:
        raise ValueError("Cart is empty")
    total = sum(i["price"] * i["qty"] for i in cart["items"])
    order_id = db.create_order(cart_id, total)
    email_service.send(cart["user_email"], f"Order {order_id} confirmed")
    db.clear_cart(cart_id)

# Good — named steps reveal the process
def handle_checkout(cart_id: int) -> None:
    cart = _get_validated_cart(cart_id)
    order_id = _create_order(cart)
    _notify_user(cart["user_email"], order_id)
    _clear_cart(cart_id)
```

Named private helpers make the top-level function read like a summary.

---

## Key Heuristics

| Signal | What It Often Means |
|--------|---------------------|
| Need a comment to understand a name | Rename it |
| Function > 30 lines | Extract sub-functions |
| More than 3 arguments | Introduce a dataclass or config object |
| Deeply nested `if`s | Early return / guard clauses |
| Repeated code block | Extract to a function |
| Magic number in expression | Named constant |
