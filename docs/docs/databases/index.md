---
date: 2026-09-01
tags:
  - databases
---

# Databases — Types, Differences & Selection Guide

## Database Categories at a Glance

| Category | Data Model | Query Language | Examples |
|----------|-----------|----------------|----------|
| **Relational (SQL)** | Tables with rows and columns | SQL | PostgreSQL, MySQL, SQLite |
| **Document** | JSON/BSON documents | Query API / SQL-like | MongoDB, CouchDB |
| **Key-Value** | Key → value pairs | GET/SET API | Redis, DynamoDB, etcd |
| **Column-Family** | Wide columns, sparse rows | CQL / SQL-like | Cassandra, ScyllaDB, HBase |
| **Graph** | Nodes + edges (relationships) | Cypher, Gremlin | Neo4j, Amazon Neptune |
| **Time-Series** | Timestamped data points | SQL / InfluxQL | TimescaleDB, InfluxDB, QuestDB |
| **Vector** | High-dimensional embeddings | ANN similarity search | Pinecone, Weaviate, Qdrant, pgvector |
| **Search Engine** | Inverted index on text | Query DSL / SQL | Elasticsearch, Meilisearch |

## Relational Databases (SQL)

Data is stored in tables with a defined schema. Relations are managed via foreign keys. Transactions keep changes consistent.

| Strength | Weakness |
|----------|----------|
| Data integrity (ACID) | Vertical scaling limits |
| Complex joins and aggregations | Schema changes can be costly |
| Mature tooling, broad SQL knowledge | Weak with deeply nested / unstructured data |

**When to use:** Structured data, financial systems, CRM/ERP, any domain where data consistency and complex queries are critical.

**Popular choices:** PostgreSQL (feature-rich, extensible), MySQL (web apps, read-heavy), SQLite (embedded, mobile, testing).

## Document Databases

Data is stored as flexible JSON-like documents. Schema is flexible, so documents can have different fields.

| Strength | Weakness |
|----------|----------|
| Schema flexibility | No multi-document ACID (varies by engine) |
| Fast reads of nested objects | Cross-collection joins are slow or absent |
| Horizontal scaling (sharding) | Data duplication / denormalization needed |

**When to use:** Content management, catalogs, user profiles, prototypes with rapidly evolving schemas.

**Popular choice:** MongoDB (most widely used document DB).

## Key-Value Stores

Simplest model: store and read values by unique key. Optimized for speed.

| Strength | Weakness |
|----------|----------|
| Sub-millisecond latency (in-memory) | No ad-hoc queries or joins |
| Simple horizontal scaling | Value is opaque — no filtering by fields |
| Predictable O(1) performance | Limited data modeling |

**When to use:** Caching, sessions, feature flags, rate limiting, shopping carts, queues.

**Popular choice:** Redis (in-memory, data structures, pub/sub).

## Column-Family (Wide-Column)

Data is organized by column families. Best for heavy writes and large analytical reads.

| Strength | Weakness |
|----------|----------|
| High write throughput | Limited ad-hoc query flexibility |
| Excellent compression | No joins |
| Linear horizontal scaling | Data modeling requires query-first design |

**When to use:** IoT ingestion, event logging, analytics on billions of rows, time-series at scale.

**Popular choices:** Cassandra, ScyllaDB, HBase.

> BigQuery, Redshift, and Snowflake are **columnar analytical warehouses** (OLAP), not wide-column operational NoSQL stores.

## Graph Databases

Core entities are **nodes** (things) and **edges** (relations). Great for traversing connected data.

| Strength | Weakness |
|----------|----------|
| Relationship queries are fast | Poor fit for tabular / aggregation workloads |
| Natural for connected data | Smaller ecosystem, fewer engineers |
| Flexible schema on nodes/edges | Scaling graph traversals is hard |

**When to use:** Social networks, recommendation engines, fraud detection, knowledge graphs, dependency analysis.

**Popular choice:** Neo4j (Cypher query language).

## Time-Series Databases

Optimized for time-stamped data, range queries, and downsampling.

| Strength | Weakness |
|----------|----------|
| Optimized time-range queries | Not for general-purpose OLTP |
| Automatic data retention / rollups | Limited join / transaction support |
| High ingestion throughput | Query flexibility varies |

**When to use:** Monitoring metrics (Prometheus), IoT sensors, financial ticks, log analytics.

**Popular choices:** TimescaleDB (PostgreSQL extension), InfluxDB, QuestDB.

## Vector Databases

Store and search high-dimensional vectors (ML embeddings), usually with ANN search.

| Strength | Weakness |
|----------|----------|
| Semantic / similarity search | Not for structured CRUD |
| Powers RAG, recommendations | Index rebuild can be expensive |
| Sub-second search on millions of vectors | Young ecosystem, rapidly evolving |

**When to use:** AI/LLM RAG pipelines, semantic search, image similarity, anomaly detection.

**Popular choices:** Pinecone, Weaviate, Qdrant, Milvus. Hybrid: PostgreSQL + pgvector.

## Decision Matrix

| Requirement | Best Fit |
|-------------|----------|
| ACID transactions, complex queries | Relational (PostgreSQL) |
| Flexible schema, nested objects | Document (MongoDB) |
| Ultra-low latency cache / sessions | Key-Value (Redis) |
| Billions of rows, write-heavy analytics | Column-Family (Cassandra) |
| Relationship traversal, recommendations | Graph (Neo4j) |
| Time-stamped metrics, IoT | Time-Series (TimescaleDB) |
| AI embeddings, semantic search | Vector (pgvector, Pinecone) |
| Full-text search, log search | Search Engine (Elasticsearch) |

## Polyglot Persistence

Modern systems often combine multiple database types:

```
User request
    │
    ├── PostgreSQL ── core business data, transactions
    ├── Redis ── session cache, rate limits
    ├── Elasticsearch ── full-text search
    └── pgvector ── AI similarity search
```

**Rule of thumb:** Start with PostgreSQL. Add specialized databases only when a specific workload outgrows what PostgreSQL can handle.

## Section Map

| File | Topics |
|------|--------|
| [PostgreSQL Overview](./postgresql/index.md) | Features, ecosystem, extensions, cheat sheet, when to choose |
| [Commands & psql](./postgresql/01-commands-psql.md) | Connection, navigation, psql shortcuts, import/export |
| [Schema & Data Types](./postgresql/02-schema-data-types.md) | Tables, types, constraints, indexes, views |
| [Queries & Performance](./postgresql/03-queries-performance.md) | EXPLAIN ANALYZE, indexing strategy, pagination, anti-patterns |
| [Admin & Operations](./postgresql/04-admin-operations.md) | Users, backup, Docker setup, tuning, monitoring |
| [Basic Query Commands](./postgresql/05-basic-query-commands.md) | SQL cheat sheet: CRUD, filters, joins, CTEs, window functions, transactions |
| [Redis Overview](./redis/index.md) | What Redis is, Valkey and licensing, use cases, cheat sheet, quick rules |
| [Setup & redis-cli](./redis/01-setup-redis-cli.md) | Docker, Compose, redis-cli, SCAN vs KEYS, INFO, SLOWLOG, key naming, databases |
| [Data Types & Commands](./redis/02-data-types-commands.md) | Strings, hashes, lists, sets, sorted sets, streams, JSON, TTL rules |
| [Patterns](./redis/03-patterns.md) | Cache-aside, invalidation, rate limiting, locks, Pub/Sub vs streams, MULTI/WATCH, pipelines, Lua |
| [Python Client (redis-py)](./redis/04-python-redis-py.md) | Connections, pools, timeouts, retries, asyncio, Pub/Sub, streams |
| [Persistence, Scaling & Security](./redis/05-operations-security.md) | RDB/AOF, eviction, replication, Sentinel, Cluster, ACL, monitoring |
| [Testing Setup & Isolation](./redis/06-testing-setup-isolation.md) | fakeredis vs real Redis, testcontainers, fixtures, FLUSHDB vs FLUSHALL, xdist, CI |
| [Testing Recipes](./redis/07-testing-recipes.md) | Cache, TTL, rate limiter, lock, race condition, Pub/Sub, outage tests, pitfalls |

---
## See also
- [Digital Garden: Knowledge Base](../index.md)
- [SQLAlchemy — Python ORM & SQL Toolkit](../libs/sqlalchemy/index.md)
- [FastAPI — Modern Async Web Framework](../libs/fastapi/index.md)
- [OOP & Error Handling](../python-guide/02-oop-error-handling/index.md)
- [Test Data](../test-automation-framework/03-test-data/index.md)
- [Redis — Overview](./redis/index.md)
