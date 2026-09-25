---
date: 2026-06-19
tags:
  - design-patterns
  - architecture
---

# Architectural Patterns: Microservices, Event-Driven, Isomorphic

## Microservices

Each domain is a separate service: its own codebase, deployment, and data store.
Services communicate via API (sync) or events (async).

**Service boundaries:** define by bounded context (Domain-Driven Design).
One service = one subdomain. Payment service does not share a DB with Order service.

**Communication patterns:**

| Pattern | When to use |
|---|---|
| REST / gRPC (sync) | Caller needs an immediate response |
| Async events | Side effects that can happen later |

```
Order Service publishes "order.placed" → Kafka
Payment Service consumes event → charges card
Fulfillment Service consumes event → prepares shipment
```

**Testing:**
- **Contract testing:** verify producer and consumer agree on event shape (Pact).
- **Integration testing:** spin up real dependencies with testcontainers.

**Risks:** partial failures, eventual consistency, distributed complexity.
Design for failure: timeout + circuit breaker + retry on every service call.

---

## Event-Driven Architecture

Services communicate by publishing and consuming events.
No direct synchronous calls for non-critical flows.

**Key characteristics:**
- Producer publishes event to a broker (Kafka, RabbitMQ, SQS).
- Consumer receives and processes at its own pace.
- Producer does not know who consumes or when.

**Event consistency patterns:**

**Outbox pattern:** write event to DB in the same transaction as the state change.
A relay process reads the outbox and publishes to the broker.
Prevents lost events if the service crashes after DB write but before publish.


```python
def place_order(order_id: str, amount: float, db) -> None:
    # Both writes are in one DB transaction — atomic
    db.execute(
        "INSERT INTO orders (id, amount) VALUES (?, ?)",
        (order_id, amount),
    )
    db.execute(
        "INSERT INTO outbox (event_type, payload) VALUES (?, ?)",
        ("order.placed", f'{{"order_id": "{order_id}"}}'),
    )
    db.commit()
    # Separate relay process reads outbox and publishes to Kafka
```


**Idempotency:** consumers must handle duplicate events safely.
Store processed event IDs and skip already-processed ones.

```python
def handle_order_placed(event_id: str, order_id: str, db) -> None:
    if db.scalar("SELECT 1 FROM processed_events WHERE id=?", (event_id,)):
        return  # already processed — skip
    # ... process ...
    db.execute("INSERT INTO processed_events (id) VALUES (?)", (event_id,))
    db.commit()
```

---

## Isomorphic / Universal Architecture

Code runs on both server and client without modification.

**Shared scope:**

| Feature | How |
|---|---|
| SSR | Server renders HTML via Jinja2 / Django templates (fast first paint, SEO). |
| Shared validation | Pydantic models used on server; OpenAPI schema generated for any client. |
| Shared types | Auto-generate client models from OpenAPI spec (`datamodel-codegen`). |

**Server-rendered + htmx:** server returns HTML fragments → htmx swaps them
into the DOM on user interaction. No full-page reload, no heavy client framework.

**Challenges:**

- Browser-only concerns (cookies, localStorage) must be managed through HTTP
  headers and server-side session stores.
- Server-only secrets must never appear in rendered HTML or API responses.

**Testing:**
- **Template rendering:** verify rendered HTML contains expected data.
- **API contract:** validate OpenAPI schema matches Pydantic models.

**Frameworks (Python):** Django + htmx, FastAPI + Jinja2, Litestar.

---

## Queues vs Streams

Events travel over two fundamentally different transports:

| | Queue (RabbitMQ, SQS) | Stream (Kafka) |
|---|---|---|
| Message lifecycle | Deleted after ACK | Persisted; consumers hold offset |
| Consumers | Compete (one message → one consumer) | Independent (each at own offset) |
| Replay | No | Yes |
| Ordering | Per queue | Per partition |
| Use for | Commands / tasks | Facts / audit log / multi-consumer |

**Retries:** use exponential backoff; separate **transient** errors (retry) from
**permanent** errors (schema mismatch → send to Dead-Letter Queue immediately).

**Dead-Letter Queue (DLQ):** a dedicated topic capturing messages that could not
be processed. Store error metadata (stack trace, source offset) alongside the
payload for debugging and replay.

> Full deep-dive with code examples, DLQ patterns, and decision guide:
> [04-queues-streams-messaging.md](04-queues-streams-messaging.md)

---

## Choosing an Architecture

| Need | Recommended pattern |
|---|---|
| Small team, clear domain, fast iteration | Layered monolith |
| Domain-heavy, complex business rules | Clean Architecture |
| Need to swap DB or add protocols | Hexagonal (Ports & Adapters) |
| Independent team scaling, per-service load | Microservices |
| Decoupled side effects, audit trail | Event-Driven + Outbox |
| SEO + interactive UI with shared logic | Isomorphic (SSR + CSR) |

---

## Architecture Testing and Risks

### Testing focus

- **Boundary validation:** verify layer and service boundaries are respected
  (controller does not call DB directly; service uses ports/interfaces).
- **Contract testing:** verify API/event schema compatibility between producer
  and consumer.
- **Integration testing:** run real DB/broker/framework adapters together with
  use cases.

### Common risks

- **Distributed complexity:** retries, partial failures, and eventual consistency
  make debugging harder.
- **Overengineering:** introducing microservices, event buses, and many adapters
  too early adds operational cost without clear business value.
