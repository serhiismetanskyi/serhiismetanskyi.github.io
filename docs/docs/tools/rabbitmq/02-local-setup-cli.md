---
date: 2026-09-30 21:00:00
tags:
  - tools
  - rabbitmq
  - docker
---

# RabbitMQ — Local Setup & CLI

## Images

| Image | Contains |
|-------|----------|
| `rabbitmq:4` | Broker only |
| `rabbitmq:4-management` | Broker + management plugin (web UI and HTTP API on 15672) — the usual choice for local work and tests |
| `rabbitmq:4-management-alpine` | Same on Alpine, smaller |

Pin a full version (for example `rabbitmq:4.3-management`) in CI so an image update doesn't change behaviour under your tests.

## Single Container

```bash
docker run -d --name rabbitmq \
  --hostname rabbitmq \
  -p 5672:5672 -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=app \
  -e RABBITMQ_DEFAULT_PASS=app-secret \
  rabbitmq:4-management
```

- **Set `--hostname`** when you keep data in a volume — the node name is `rabbit@<hostname>`, and a new random container hostname means a new, empty node.
- **`guest/guest` from other hosts**: RabbitMQ allows `guest` only from localhost, but the official Docker image turns that off (`loopback_users.guest = false` in `/etc/rabbitmq/conf.d/10-defaults.conf`), so in Docker `guest` works from the host and from other containers. On a package install or a custom config it gets `ACCESS_REFUSED` from anywhere but localhost — use your own user outside local runs.
- With `RABBITMQ_DEFAULT_USER` set, no `guest` user is created.
- `RABBITMQ_DEFAULT_VHOST` replaces the default vhost: with `RABBITMQ_DEFAULT_VHOST=orders` the broker starts with only `orders`, no `/`.

## Docker Compose with a Healthcheck

```yaml
services:
  rabbitmq:
    image: rabbitmq:4-management
    hostname: rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: app
      RABBITMQ_DEFAULT_PASS: app-secret
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 5s
      timeout: 5s
      retries: 12

  worker:
    build: .
    environment:
      AMQP_URL: amqp://app:app-secret@rabbitmq:5672/
    depends_on:
      rabbitmq:
        condition: service_healthy

volumes:
  rabbitmq-data:
```

`rabbitmq-diagnostics -q ping` succeeds once the node is running. For a stricter check before tests start, use `rabbitmq-diagnostics -q check_port_connectivity` (listeners accept connections).

## Connection URLs

```text
amqp://user:password@host:5672/            # vhost "/"
amqp://user:password@host:5672/orders       # vhost "orders"
amqp://user:password@host:5672/%2F          # vhost "/" written explicitly (URL-encoded)
amqps://user:password@host:5671/            # TLS
```

## rabbitmqctl and rabbitmq-diagnostics

Run inside the container: `docker exec rabbitmq <command>`.

!!! warning "Don't run the CLI in the first second after start"
    `docker exec` runs as root. If a CLI command runs before the broker has created `/var/lib/rabbitmq/.erlang.cookie`, the CLI creates it owned by root, and the broker, running as `rabbitmq`, fails with `eacces` on the cookie and exits. A script that does `docker run` and immediately loops on `docker exec ... rabbitmq-diagnostics ping` hits this. Wait for the healthcheck, or run the command as the broker user: `docker exec -u rabbitmq rabbitmq rabbitmq-diagnostics -q ping`.

| Task | Command |
|------|---------|
| Node health | `rabbitmq-diagnostics -q ping` |
| Node status, versions, memory | `rabbitmq-diagnostics status` |
| Alarms (memory, disk) | `rabbitmq-diagnostics alarms` |
| Queues with depth | `rabbitmqctl list_queues name type messages messages_ready messages_unacknowledged consumers` |
| Queues in a vhost | `rabbitmqctl list_queues -p orders name messages` |
| Exchanges | `rabbitmqctl list_exchanges name type` |
| Bindings | `rabbitmqctl list_bindings source_name routing_key destination_name` |
| Connections and channels | `rabbitmqctl list_connections user peer_host state` · `rabbitmqctl list_channels connection prefetch_count messages_unacknowledged` |
| Consumers | `rabbitmqctl list_consumers queue_name channel_pid prefetch_count` |
| Empty a queue | `rabbitmqctl purge_queue billing` |
| Delete a queue | `rabbitmqctl delete_queue billing` |
| Create a vhost | `rabbitmqctl add_vhost orders` |
| Create a user | `rabbitmqctl add_user billing 's3cret'` |
| Grant permissions (configure, write, read) | `rabbitmqctl set_permissions -p orders billing ".*" ".*" ".*"` |
| Tag a user as admin for the UI | `rabbitmqctl set_user_tags billing administrator` |
| Enabled plugins | `rabbitmq-plugins list -e` |
| Enable a plugin (stream protocol on 5552) | `rabbitmq-plugins enable rabbitmq_stream` |

The `-management` image already enables `rabbitmq_management` and `rabbitmq_prometheus` (metrics on 15692).

`messages_unacknowledged` that keeps growing while `messages_ready` stays low usually means a consumer takes messages and never acks them.

## Management UI and HTTP API

The UI at `http://localhost:15672` shows queues with rates, lets you publish and get messages by hand, and exports definitions. The same data is available over the HTTP API, which is handy in tests and scripts:

```bash
curl -s -u app:app-secret http://localhost:15672/api/overview | jq '.rabbitmq_version'
curl -s -u app:app-secret http://localhost:15672/api/queues/%2F/billing | jq '{messages, consumers}'
curl -s -u app:app-secret http://localhost:15672/api/queues | jq '.[] | {name, messages}'
```

- The vhost goes into the path URL-encoded: `/` is `%2F`.
- Queue counters in the API are **refreshed every few seconds** (statistics interval 5 s by default; quorum queues can lag longer), not in real time — in tests poll with a deadline, don't read once.
- Getting messages through the UI or API with the default "Nack message requeue true" mode **redelivers them**; they come back with `redelivered=True`.

## Definitions: Topology as Code

Exchanges, queues, bindings, users, vhosts and policies can be exported and imported as one JSON file:

```bash
curl -s -u app:app-secret http://localhost:15672/api/definitions > definitions.json     # export
docker exec rabbitmq rabbitmqctl import_definitions /tmp/definitions.json              # import (file inside the container)
```

To load definitions at start, mount the file and point the broker at it in `rabbitmq.conf`:

```ini
# /etc/rabbitmq/rabbitmq.conf
load_definitions = /etc/rabbitmq/definitions.json
```

For tests it is usually simpler to **declare the topology from the test fixtures** (see [04 Testing](./04-testing.md)) — declarations are idempotent when the properties match.

## Policies

Policies apply queue settings by name pattern without changing the code that declares queues:

```bash
# every queue starting with "billing." gets a DLX and a length limit
rabbitmqctl set_policy billing-dlx "^billing\." \
  '{"dead-letter-exchange":"billing.dlx","max-length":100000}' --apply-to queues
```

Arguments set by the client at declaration (`x-...`) take precedence over some policy keys and can't be changed afterwards; policies can. Prefer policies for operational limits (TTL, length, DLX) so they can be tuned without redeploying.

## Checklist

- [ ] Image pinned to a version, with the management plugin for local and test use
- [ ] `hostname` set when data lives in a volume
- [ ] Own user and vhost instead of `guest`
- [ ] Healthcheck with `rabbitmq-diagnostics -q ping`, services wait on it
- [ ] Topology declared from code or loaded from definitions, not clicked in the UI

---
## See also
- [RabbitMQ — Overview](./index.md)
- [RabbitMQ — Core Concepts](./01-core-concepts.md)
- [RabbitMQ — Python Clients](./03-python-clients.md)
- [Docker & Docker Compose](../docker/index.md)
