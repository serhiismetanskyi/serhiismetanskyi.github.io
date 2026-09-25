---
date: 2026-08-17
tags:
  - python
  - pytest
  - testing
---

# Fixtures & Parametrize

Fixtures provide test data and setup. Parametrize runs the same test with different inputs.

---

## Fixtures

A fixture is a function that provides data or setup for tests.

```python
import pytest

@pytest.fixture
def api_url() -> str:
    return "https://api.example.com"

def test_api_connection(api_url: str):
    assert api_url.startswith("https://")
```

### Fixtures with Setup and Teardown

```python
import pytest

@pytest.fixture
def temp_file(tmp_path):
    file_path = tmp_path / "test_data.json"
    file_path.write_text('{"key": "value"}')
    yield file_path
    # Cleanup runs after the test
    if file_path.exists():
        file_path.unlink()
```

### Fixture Scopes

| Scope | Created | Destroyed |
|-------|---------|-----------|
| `function` | Per test (default) | After each test |
| `class` | Per test class | After class finishes |
| `module` | Per test file | After file finishes |
| `session` | Once for all tests | After all tests |

```python
@pytest.fixture(scope="session")
def database_connection():
    conn = create_connection()
    yield conn
    conn.close()
```

### Fixture Dependencies

Fixtures can use other fixtures:

```python
@pytest.fixture
def base_url() -> str:
    return "https://api.example.com"

@pytest.fixture
def api_client(base_url: str):
    return ApiClient(base_url)

def test_get_users(api_client):
    users = api_client.get("/users")
    assert len(users) > 0
```

---

## Parametrize

Run the same test with different data:

```python
import pytest

@pytest.mark.parametrize("input_val,expected", [
    (1, 1),
    (2, 4),
    (3, 9),
    (4, 16),
])
def test_square(input_val: int, expected: int):
    assert input_val ** 2 == expected
```

### Multiple Parameters

```python
@pytest.mark.parametrize("a,b,expected", [
    (1, 2, 3),
    (0, 0, 0),
    (-1, 1, 0),
    (100, 200, 300),
])
def test_addition(a: int, b: int, expected: int):
    assert a + b == expected
```

### Parametrize with IDs

```python
@pytest.mark.parametrize("status_code,expected_text", [
    pytest.param(200, "OK", id="success"),
    pytest.param(404, "Not Found", id="not-found"),
    pytest.param(500, "Server Error", id="server-error"),
])
def test_status_message(status_code: int, expected_text: str):
    assert get_status_text(status_code) == expected_text
```

---

## Markers

Markers add metadata to tests:

### Built-in Markers

```python
import pytest
import sys

@pytest.mark.skip(reason="Not implemented yet")
def test_new_feature():
    pass

@pytest.mark.skipif(
    sys.platform == "win32",
    reason="Linux only",
)
def test_linux_feature():
    pass

@pytest.mark.xfail(reason="Known bug #123")
def test_known_bug():
    assert broken_function() == "expected"
```

### Custom Markers

Register markers in `pyproject.toml`:

```toml
[tool.pytest.ini_options]
markers = [
    "slow: marks tests as slow",
    "api: marks API tests",
    "ui: marks UI tests",
]
```

Use markers in tests:

```python
@pytest.mark.slow
def test_large_data_processing():
    pass

@pytest.mark.api
def test_create_user():
    pass
```

Run tests by marker:

```bash
uv run pytest -m "api"           # only API tests
uv run pytest -m "not slow"      # skip slow tests
uv run pytest -m "api and not slow"  # combine markers
```

---

## conftest.py Patterns

### Shared Fixtures

```python
# tests/conftest.py
import pytest

@pytest.fixture(scope="session")
def base_url() -> str:
    return "https://staging.example.com"

@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}
```

### Auto-use Fixtures

Fixtures that run for every test automatically:

```python
@pytest.fixture(autouse=True)
def reset_database(db):
    yield
    db.rollback()
```

---

## Best Practices

- Use **fixtures** instead of repeated setup code
- Keep fixtures **simple** — extract complex setup to helper functions
- Use the **smallest scope** that works (prefer `function` scope)
- Use **`yield`** fixtures for setup + teardown
- Use **parametrize** to avoid duplicate tests with different data
- Add **IDs** to parametrize for clear test names
- Register **custom markers** in `pyproject.toml`
- Put shared fixtures in **`conftest.py`**
