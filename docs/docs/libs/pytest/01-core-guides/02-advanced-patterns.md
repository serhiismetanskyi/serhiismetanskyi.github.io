---
date: 2026-09-20
tags:
  - python
  - libraries
  - pytest
  - testing
---

# Pytest — Advanced Patterns & Best Practices

## Mocking

### unittest.mock (built-in)

```python
from unittest.mock import MagicMock, patch


def test_fetch_weather():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"temp": 22}

    # patch where the name is looked up, not where it is defined
    with patch("myapp.weather.requests.get", return_value=mock_resp) as mock_get:
        result = get_weather("Kyiv")
        assert result["temp"] == 22
        mock_get.assert_called_once_with(
            "https://api.weather.com/v1/Kyiv",
            timeout=(3.05, 10),
        )
```

### pytest-mock (mocker fixture)

Auto-cleanup after each test. No manual `with patch(...)` context needed.

```python
def test_send_email(mocker):
    mock_smtp = mocker.patch("myapp.notify.smtplib.SMTP")
    send_welcome("alice@example.com")
    mock_smtp.return_value.sendmail.assert_called_once()
```

### mocker.spy — Observe Without Replacing

Wraps the real function but records calls. Useful when you want real behavior + verification.

```python
def test_cache_calls_backend(mocker):
    # spy keeps real logic, but lets you check calls
    spy = mocker.spy(cache_module, "compute_expensive")
    result = cache_module.get_or_compute("key-1")
    spy.assert_called_once_with("key-1")
    assert result == expected_value
```

### Where to Patch

Patch where the name is **looked up**, not where it is defined:

```python
# myapp/service.py does: from myapp.client import fetch_data
# Correct:   mocker.patch("myapp.service.fetch_data")
# Incorrect: mocker.patch("myapp.client.fetch_data")
```

### Mock vs Real — Decision Table

| Boundary | Mock? | Why |
|----------|-------|-----|
| HTTP API calls | Yes | Avoid flakiness, speed |
| Database | Depends | In-memory SQLite or testcontainers for integration |
| Filesystem | Use `tmp_path` | Real FS, auto-cleaned |
| Time / datetime | Yes | `freezegun` or `mocker.patch` |
| Internal logic | No | Test real behavior |

---

## Built-in Fixtures

### monkeypatch

Temporarily override attributes, env vars, or dict items. Auto-reverted.

```python
def test_api_url(monkeypatch):
    monkeypatch.setenv("API_URL", "https://staging.example.com")
    assert get_api_url() == "https://staging.example.com"


def test_disable_cache(monkeypatch):
    # setattr overrides a module-level constant for the test
    monkeypatch.setattr("myapp.cache.ENABLED", False)
    result = fetch_data("key")
    assert result is not None
```

| Method | Purpose |
|--------|---------|
| `setenv(name, value)` | Set environment variable |
| `delenv(name, raising=False)` | Remove env var |
| `setattr(obj, name, value)` | Override attribute (also: `setattr("dotted.path", value)`) |
| `setitem(dict, key, value)` | Override dict entry |
| `chdir(path)` | Change working directory |

### tmp_path / tmp_path_factory

```python
def test_write_report(tmp_path):
    # tmp_path is a pathlib.Path, unique per test, auto-cleaned
    report_file = tmp_path / "report.txt"
    write_report(report_file, data={"users": 42})
    assert "42" in report_file.read_text()


@pytest.fixture(scope="session")
def shared_dir(tmp_path_factory):
    """Session-scoped temp dir for expensive shared data."""
    return tmp_path_factory.mktemp("data")
```

### capsys / caplog

```python
import logging


def test_cli_output(capsys):
    """capsys captures stdout and stderr."""
    print_summary(users=10, errors=2)
    captured = capsys.readouterr()
    assert "10 users" in captured.out


def test_warning_logged(caplog):
    """caplog captures log records at the specified level."""
    with caplog.at_level(logging.WARNING):
        fetch_with_retry("https://api.example.com/data")
    assert "Retrying" in caplog.text
```

---

## Async Testing

Requires `pytest-asyncio`. Set `asyncio_mode = "auto"` to skip the marker.

```python
import pytest
import pytest_asyncio
import httpx


@pytest.mark.asyncio
async def test_async_fetch():
    async with httpx.AsyncClient() as client:
        resp = await client.get("https://api.example.com/users/1")
    assert resp.status_code == 200


@pytest_asyncio.fixture
async def async_db():
    """Async fixtures need @pytest_asyncio.fixture (works in both strict and auto modes)."""
    conn = await connect_db()
    yield conn
    await conn.close()
```

---

## Parallel Execution & Coverage

```bash
# parallel: each worker gets a subset of tests (pytest-xdist)
pytest -n auto
# coverage: branch coverage with min threshold
pytest --cov=src --cov-report=term-missing --cov-fail-under=100
```

Tests must be independent — no shared mutable state between workers.

---

## Plugins

| Plugin | Purpose |
|--------|---------|
| `pytest-cov` | Coverage reporting |
| `pytest-xdist` | Parallel test execution |
| `pytest-asyncio` | Async test support |
| `pytest-mock` | `mocker` fixture |
| `pytest-timeout` | Per-test time limits |
| `pytest-randomly` | Randomize order to find coupling |

## Best Practices

- One behavior per test — clear failure messages.
- `yield` fixtures — guaranteed teardown on failure.
- Keep fixtures near tests — `conftest.py` per directory.
- `tmp_path` over manual dirs — auto-cleaned, isolated.
- `--strict-markers` + `--strict-config` — catch typos early.
- Mock boundaries, not internals — test real logic.
- `filterwarnings = ["error"]` — warnings become errors in CI.
