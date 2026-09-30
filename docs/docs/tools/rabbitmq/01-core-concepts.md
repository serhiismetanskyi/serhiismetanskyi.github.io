---
date: 2026-09-30 21:00:00
tags:
  - tools
  - rabbitmq
  - architecture
---

# RabbitMQ — Core Concepts

Most surprises with RabbitMQ — messages that "disappear", queues that grow forever, one consumer doing all the work, duplicates after a restart — come from the routing model and the ack rules below.

## Vocabulary

| Term | Meaning |
|------|---------|
| **Producer** | Publishes messages to an exchange with a routing key |
| **Exchange** | Receives messages and routes copies to bound queues; stores nothing |
| **Queue** | Stores messages until a consumer acks them |
| **Binding** | Rule "exchange → queue", optionally with a binding key or header match |
| **Routing key** | String on the message that exchanges match against binding keys |
| **Consumer** | Subscribes to a queue and acks (or rejects) each delivery |
| **Virtual host (vhost)** | Isolated namespace of exchanges, queues and permissions inside one broker |
| **Connection / channel** | One TCP connection per process; lightweight channels inside it for each thread or task |
| **Delivery tag** | Per-channel number of a delivery, used to ack or reject it |

## Exchange Types

| Type | Routes a message to… | Typical use |
|------|----------------------|-------------|
| **direct** | Queues whose binding key equals the routing key | Commands to a specific worker type (`resize`, `send_email`) |
| **topic** | Queues whose binding pattern matches the dotted routing key: `*` = exactly one word, `#` = zero or more words | Events by category: `order.*`, `order.#`, `*.eu.created` |
| **fanout** | Every bound queue, routing key ignored | Broadcast: cache invalidation, notifications to all services |
| **headers** | Queues whose header rules match the message headers (`x-match: all` or `any`) | Routing on several attributes instead of one key |

- The **default exchange** (name `""`) is a direct exchange that every queue is bound to by its own name — `basic_publish(exchange="", routing_key="orders")` puts the message into queue `orders`.
- A message that **matches no binding is dropped silently**, unless the producer publishes with `mandatory=True` (the broker returns it) or the exchange has an **alternate exchange** configured.

```text
exchange "orders" (topic)
  binding "order.*"        -> queue billing      gets order.created, order.paid
  binding "order.created"  -> queue emails       gets order.created only
  binding "#"              -> queue audit        gets everything
routing key "order.created" -> billing, emails, audit (three copies)
routing key "user.created"  -> audit only
```

## Queues and Their Types

| Type | Declared with | Use for |
|------|---------------|---------|
| **Quorum** | `x-queue-type: quorum` | Default choice for durable, replicated queues; Raft-based, survives node loss |
| **Classic** | default (`x-queue-type: classic`) | Exclusive or temporary queues, single-node setups; not replicated in 4.x |
| **Stream** | `x-queue-type: stream` | Replayable log: consumers read from an offset, messages stay after reading |

Queue properties set at declaration:

- **durable** — the queue definition survives a broker restart (quorum queues and streams are always durable). A queue that is neither durable nor exclusive is **refused by default** in recent 4.x releases (the deprecated `transient_nonexcl_queues` feature): the declare fails with `INTERNAL_ERROR` and the connection is closed. pika and aio-pika default to `durable=False`, so pass `durable=True` or `exclusive=True`.
- **exclusive** — only the declaring connection can use it; deleted when that connection closes. Good for per-test and reply queues.
- **auto-delete** — deleted when the last consumer unsubscribes.
- **arguments** — `x-queue-type`, `x-message-ttl`, `x-dead-letter-exchange`, `x-max-length`, `x-delivery-limit` and others.

Declaring an existing queue with **different properties** fails with `PRECONDITION_FAILED` and closes the channel — keep one source of truth for declarations.

## Acknowledgements and Redelivery

| Consumer action | What the broker does |
|-----------------|----------------------|
| `basic_ack` | Removes the message |
| `basic_nack` / `basic_reject` with `requeue=True` | Puts it back in the queue for another delivery |
| `basic_nack` / `basic_reject` with `requeue=False` | Dead-letters it if the queue has a DLX, otherwise drops it |
| Channel or connection closes before an ack | Requeues every unacked message and sets `redelivered=True` on the next delivery |
| `auto_ack=True` | Removes the message the moment it is sent — lost if the consumer then crashes |

- Delivery is **at-least-once** with manual acks: a consumer that crashes after doing the work but before the ack will see the message again. Handlers must be idempotent.
- **Requeue in a loop is a trap**: a message that always fails and is always requeued blocks the consumer. Quorum queues cap this with a **delivery limit** (`x-delivery-limit`, **20 by default since RabbitMQ 4.0**, `-1` for no limit); after it the message is dead-lettered (reason `delivery_limit`) or, without a DLX, dropped.
- **Not every requeue counts** toward the limit. Tested on RabbitMQ 4.3.6: `basic_reject(requeue=True)` and a channel closed before the ack increase the delivery count (the `x-delivery-count` header), but `basic_nack(requeue=True)` does not — a consumer that nacks with requeue loops forever even with `x-delivery-limit` set. Use `basic_reject` for "retry, but not forever".

## Prefetch (QoS)

`basic_qos(prefetch_count=N)` limits how many **unacked** messages the broker sends to one consumer on a channel.

- **Without a prefetch** the broker pushes as many messages as it can to the first consumer; other consumers sit idle and a slow consumer holds a huge backlog in memory.
- **Low prefetch (1–10)** — fair distribution for slow or uneven tasks.
- **Higher prefetch (50–300)** — throughput for fast, uniform messages.

## Durability: What Survives a Restart

A message survives a broker restart only if **all** of these hold:

1. The **queue** is durable (or quorum / stream).
2. The **message** is persistent (`delivery_mode=2`).
3. The producer used **publisher confirms** and got the confirm — before that the broker may not have written it.

A durable queue with non-persistent messages keeps the queue and loses the messages.

## Publisher Confirms

With confirms enabled (`confirm_delivery()` in pika, `publisher_confirms=True` by default in aio-pika channels) the broker acks each publish once it has taken responsibility for the message: routed and written to the queues (for quorum queues — replicated to a majority).

- A **nack** means the broker could not take it — retry or fail loudly.
- With `mandatory=True`, an unroutable message comes back as a **return**; in pika's blocking API that is `UnroutableError`.
- Confirms cost throughput when you wait for each one; batch or publish asynchronously for volume.

## TTL and Dead Lettering

- **Message TTL** — per queue (`x-message-ttl` in ms) or per message (`expiration` property as a string). Expired messages are dead-lettered or dropped.
- **Queue length limit** — `x-max-length` / `x-max-length-bytes` with `x-overflow` (`drop-head` by default, or `reject-publish`).
- **Dead-letter exchange (DLX)** — `x-dead-letter-exchange` (and optional `x-dead-letter-routing-key`) on a queue. A message is dead-lettered when it is rejected with `requeue=False`, expires, exceeds the length limit, or exceeds the delivery limit. The broker adds an `x-death` header with the reason and count.

A common **retry with delay** layout: consumer rejects → DLX → a "wait" queue with `x-message-ttl` and its own DLX pointing back to the work exchange → the message returns after the delay. After N attempts (read from `x-death`) the consumer sends it to a final DLQ instead.

## Streams in One Paragraph

A stream queue keeps messages after they are read; each consumer picks a starting point with the `x-stream-offset` consumer argument (`first`, `last`, `next`, a number or a timestamp) and must use manual acks with a prefetch. Retention is by size or age (`x-max-length-bytes`, `x-max-age`). Use streams for fan-out to many readers, replay or large backlogs; the dedicated stream protocol on port 5552 is faster than AMQP for this.

## Delivery Guarantees in One Table

| Setup | Guarantee | Risk |
|-------|-----------|------|
| `auto_ack=True` | At-most-once | Lost messages on consumer crash |
| Manual ack after processing | At-least-once | Duplicates after crash or network loss — handle with idempotency |
| Manual ack + idempotent handler + confirms + persistent messages on quorum queues | Effectively once, end to end | Needs a deduplication key and a store for processed keys |

---
## See also
- [RabbitMQ — Overview](./index.md)
- [RabbitMQ — Local Setup & CLI](./02-local-setup-cli.md)
- [RabbitMQ — Python Clients](./03-python-clients.md)
- [Queues vs Streams: Message Delivery, Ordering & Reliability](../../software-design-patterns/05-composition-architectural/04-queues-streams-messaging.md)
- [Kafka — Core Concepts](../kafka/01-core-concepts.md)
