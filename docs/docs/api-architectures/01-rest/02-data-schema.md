---
date: 2026-06-01
tags:
  - api
  - architecture
  - rest
---

# REST: Data Schema and Validation

## 1.3 Data Schema

### OpenAPI 3.1 / JSON Schema

OpenAPI is the standard way to define REST API contracts. Version 3.1 is now fully aligned with
JSON Schema 2020-12. This means you can use native JSON Schema features directly in your API spec.

Benefits: single source of truth, auto-generated docs and SDKs, automatic request/response validation, shared schemas between teams.

### Required vs Optional Fields

**Required** — field must be present. If missing, return `422`.
**Optional** — field can be absent. Server uses a default value or skips it.

```json
{
  "type": "object",
  "required": ["name", "email"],
  "properties": {
    "name": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "bio": { "type": "string" }
  }
}
```

Here `name` and `email` are required. `bio` is optional.

### Nullable vs Missing

These are different concepts. Many bugs come from confusing them.

**Nullable** — field is present but value is `null`: `{ "name": "Alice", "phone": null }`
**Missing** — field is not in payload at all: `{ "name": "Alice" }`

In OpenAPI 3.1, express nullable with a type array: `{ "phone": { "type": ["string", "null"] } }`

For PATCH requests this difference is critical:
- `"phone": null` means "set phone to empty"
- Field missing means "do not change phone"

### Type Validation

Every field must have a defined type. Reject wrong types with `422`.

| Expected | Valid | Invalid |
|----------|-------|---------|
| integer  | `42`  | `"42"`, `42.5` |
| string   | `"hello"` | `123`, `true` |
| boolean  | `true`, `false` | `"true"`, `1` |
| array    | `[1, 2]` | `"1,2"` |

Do not coerce types silently. If you expect an integer, reject `"42"` as a string.

### Format Validation

**UUID:** Valid: `"550e8400-e29b-41d4-a716-446655440000"` | Invalid: `"not-a-uuid"`
**Email:** Valid: `"user@example.com"` | Invalid: `"user@"`, `"@example.com"`
**ISO 8601:** Valid: `"2026-03-25T14:30:00Z"` | Invalid: `"25/03/2026"`, `"2026-13-01T00:00:00Z"`

### Enum Constraints

When a field can only take specific values, use an enum:

```json
{ "status": { "type": "string", "enum": ["active", "inactive", "pending"] } }
```

If the client sends `"status": "deleted"`, return `422` with a message listing allowed values.

### Length Constraints

Set boundaries to prevent abuse and data quality issues:

```json
{
  "name": { "type": "string", "minLength": 1, "maxLength": 255 },
  "age": { "type": "integer", "minimum": 0, "maximum": 150 },
  "tags": { "type": "array", "minItems": 1, "maxItems": 10 }
}
```

Always set `maxLength` on string fields. Without it, a client could send a 10 MB string.

### Nested Validation

Validate objects inside objects and items inside arrays:

```json
{
  "type": "object",
  "required": ["items"],
  "properties": {
    "items": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["product_id", "quantity"],
        "properties": {
          "product_id": { "type": "string", "format": "uuid" },
          "quantity": { "type": "integer", "minimum": 1 }
        }
      }
    }
  }
}
```

Every level of nesting needs its own validation rules.

### Strict vs Loose Schema

**Strict mode** (`additionalProperties: false`): rejects any field not defined in the schema.
**Loose mode** (`additionalProperties: true`): ignores unknown fields silently.

For APIs, use strict mode. It catches typos and prevents unexpected data from entering your system.
If a client sends `{ "name": "Alice", "emial": "a@b.com" }`, strict mode catches the typo.

### Unknown Fields and Mass Assignment

**Mass assignment** happens when a client sets fields they should not control.

Bad — single schema allows client to set `role` or `created_at`:
```json
{ "name": "Alice", "email": "alice@example.com", "role": "admin", "created_at": "2020-01-01T00:00:00Z" }
```

Good — separate input and output schemas:

**Input (what client sends):** `{ "name": "Alice", "email": "alice@example.com" }`
**Output (what server returns):**
```json
{ "id": "uuid-123", "name": "Alice", "email": "alice@example.com", "role": "user", "created_at": "2026-03-25T10:00:00Z" }
```

Rules:
- Never allow clients to set `id`, `created_at`, `updated_at`, `role`, or any internal field
- Use `additionalProperties: false` to reject unexpected fields
- Define separate schemas: `UserCreate`, `UserUpdate`, `UserResponse`
- In frameworks like FastAPI or Django REST Framework, this maps directly to separate Pydantic models / serializers

### Schema Composition

JSON Schema supports combining schemas:

- `oneOf`: value must match exactly one schema (e.g., payment method is Card OR BankTransfer)
- `anyOf`: value must match at least one schema (e.g., identifier is email OR phone)
- `allOf`: value must match all schemas (used for schema inheritance / mixins)

### Read-Only and Write-Only Fields

OpenAPI 3.x supports `readOnly` and `writeOnly` modifiers:

- `readOnly: true` — field appears in responses but is ignored in requests (`id`, `created_at`)
- `writeOnly: true` — field appears in requests but is excluded from responses (`password`)

These replace the need for some separate input/output schemas.

### Summary of Best Practices

| Practice | Recommendation |
|----------|---------------|
| Required fields | Mark explicitly, validate on every request |
| Nullable | Use `type: ["string", "null"]` in OpenAPI 3.1 |
| Types | Strict type checking, never coerce silently |
| Formats | Validate UUID, email, datetime at the schema level |
| Enums | List all allowed values, reject others |
| Lengths | Always set min/max for strings and arrays |
| Nesting | Validate every level |
| Extra fields | Reject with `additionalProperties: false` |
| Mass assignment | Separate input and output schemas |
