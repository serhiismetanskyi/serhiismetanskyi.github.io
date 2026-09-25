---
date: 2026-07-20
tags:
  - test-automation
  - architecture
---

# Framework Directory Structure

## Canonical Layout

```
project-root/
├── tests/
│   ├── e2e/              # Browser-driven end-to-end tests
│   ├── api/              # HTTP/gRPC/WebSocket API tests
│   └── integration/      # Service-to-service integration tests
│
├── framework/
│   ├── core/             # Reusable cross-domain logic
│   │   ├── retry.py
│   │   ├── wait.py
│   │   └── logger.py
│   ├── drivers/          # Communication channel wrappers
│   │   ├── http.py
│   │   ├── browser.py
│   │   └── grpc.py
│   ├── builders/         # Test data builders
│   ├── assertions/       # Custom assertion helpers
│   └── utils/            # Miscellaneous helpers
│
├── data/
│   ├── fixtures/         # Static JSON/YAML test data
│   └── factories/        # Dynamic data factories
│
└── config/
    └── environments/     # Per-environment config files
        ├── dev.yaml
        ├── staging.yaml
        └── prod.yaml
```

---

## What Goes Where

### `tests/e2e/`

Browser-level user journey tests. Slow. Minimal count.
Mirror the application domain, not the file structure of the app.

```
tests/e2e/
├── auth/
│   ├── test_login.py
│   └── test_logout.py
└── checkout/
    └── test_purchase_flow.py
```

### `tests/api/`

Fast HTTP/gRPC tests against service endpoints.
No browser. No UI. Maximum count.

```
tests/api/
├── users/
│   ├── test_create_user.py
│   └── test_update_user.py
└── orders/
    ├── test_create_order.py
    └── test_order_status.py
```

### `framework/`

Not for test cases. Only reusable framework components.
If a file in `framework/` contains `def test_`, it is in the wrong place.

### `data/fixtures/`

Static, version-controlled test data. JSON or YAML.
Used when data is stable and shared across many tests.

```yaml
# data/fixtures/products.yaml
- sku: "WIDGET-001"
  name: "Standard Widget"
  price: 9.99
```

### `config/environments/`

One file per deployment environment.
Never commit secrets here — reference env variables.

```yaml
# config/environments/staging.yaml
base_url: "https://api.staging.example.com"
timeout_seconds: 30
db_host: "${DB_HOST}"
```

---

## Test Case Structure — Arrange / Act / Assert

Every test follows the same three-phase structure:

```python
def test_user_cannot_order_out_of_stock_item(
    api_client: ApiClient,
    product_factory: ProductFactory,
    user_factory: UserFactory,
) -> None:
    # Arrange
    user = user_factory.create_verified()
    product = product_factory.create(stock=0)

    # Act
    response = api_client.orders.create(
        user_id=user.id,
        items=[product.sku],
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["error"] == "OUT_OF_STOCK"
```

Rules:
- One assertion focus per test (one behaviour, not one `assert`)
- Arrange block creates all state; no state created in Act or Assert
- Comments (`# Arrange`, `# Act`, `# Assert`) are required when the block is non-trivial

---

## Naming Conventions

| Item | Pattern | Example |
|------|---------|---------|
| Test file | `test_<subject>.py` | `test_login.py` |
| Test function | `test_<scenario>` | `test_invalid_password_returns_401` |
| Page object | `<Page>Page` | `LoginPage` |
| API client | `<Domain>Client` | `UsersClient` |
| Builder | `<Model>Builder` | `UserBuilder` |
| Fixture | noun describing what it provides | `verified_user`, `empty_cart` |

---

## conftest.py Placement

| Location | Contains |
|----------|---------|
| `tests/conftest.py` | Global fixtures (driver, config, logging) |
| `tests/api/conftest.py` | API-specific fixtures (http client, auth) |
| `tests/e2e/conftest.py` | Browser-specific fixtures (page, browser) |

Never put fixtures in conftest that are only used by one test file — put them in that file.
