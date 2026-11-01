---
date: 2026-10-22 12:00:00
tags:
  - aws
  - cloudwatch
  - boto3
  - metrics
  - python
---

# Amazon CloudWatch — Metrics with boto3 & the Embedded Metric Format

The `cloudwatch` client (endpoint `monitoring.<region>.amazonaws.com`) writes and reads metrics, alarms and dashboards. Sessions, `Config`, timeouts, retry modes and paginators are in [Foundations: Clients, Config, Retries & Errors](../foundations/01-clients-config-errors.md); this page covers what is specific to CloudWatch.

```python
import boto3
from botocore.config import Config

cw = boto3.client("cloudwatch", config=Config(retries={"mode": "standard", "max_attempts": 5}))
```

## Publishing with `put_metric_data`

| Form | Fields | Use when | Percentiles |
|------|--------|----------|-------------|
| Single value | `Value` | One observation per call, low volume | Yes |
| Values and counts | `Values` (distinct numbers, up to 150) + `Counts` (how often each occurred) | Many observations per minute: aggregate locally, keep the distribution | Yes |
| Statistic set | `StatisticValues` = `SampleCount`, `Sum`, `Minimum`, `Maximum` | You only have totals | No (only for the special cases in [01](./01-metrics-core-concepts.md#units-statistics-and-percentiles)) |

```python
import datetime as dt

DIMS = [{"Name": "Service", "Value": "orders-api"}]
now = dt.datetime.now(dt.timezone.utc)

cw.put_metric_data(Namespace="QA/Orders", MetricData=[                       # up to 1000 items, 1 MB per request
    {"MetricName": "Latency", "Value": 120.5, "Unit": "Milliseconds", "Timestamp": now, "Dimensions": DIMS},
    {"MetricName": "Latency", "Values": [80.0, 120.0, 900.0], "Counts": [40, 9, 1],      # 50 observations, 3 numbers sent
     "Unit": "Milliseconds", "Timestamp": now, "Dimensions": DIMS},
    {"MetricName": "QueueDepth", "Unit": "Count", "Timestamp": now, "Dimensions": DIMS,   # pre-aggregated: no percentiles
     "StatisticValues": {"SampleCount": 12, "Sum": 340, "Minimum": 5, "Maximum": 80}},
    {"MetricName": "Heartbeat", "Value": 1, "Unit": "Count", "Dimensions": DIMS,
     "StorageResolution": 1},                                                         # stored per second, custom metrics only
])
```

- **A validation error in any item fails the whole request** (`InvalidParameterValue`); success returns an empty body. Timestamps outside "two weeks back, two hours ahead" are rejected, and so are NaN and infinity.
- **Pass `Timestamp` as a timezone-aware UTC `datetime`** (`datetime.now(timezone.utc)`) or leave it out.
- **Several items with the same identity in one call are fine;** CloudWatch aggregates them per period.
- **`Counts` may be fractional** (they are doubles), and omitted `Counts` means 1 for each value.
- Do **not** call `put_metric_data` once per event in a hot path: it is billed per request and limited to 500 requests per second per Region by default. Aggregate and flush on a timer.

## A Batching `MetricsEmitter`

The emitter below keeps the AWS call at the edge: everything before `put_metric_data` is a pure function that tests can call without any client.

```python
# app/metrics.py (excerpt: to_dimensions, check_value, Sample and the UNITS set are in the same module)
def aggregate(samples: list[Sample]) -> list[dict]:
    """Group samples by metric identity and time bucket into Values/Counts items (raw values: percentiles keep working)."""
    groups: dict[tuple, Counter] = defaultdict(Counter)
    for s in samples:
        bucket = 1 if s.high_res else 60                       # high-resolution data keeps 1-second buckets
        start = int(s.timestamp // bucket) * bucket
        groups[(s.name, s.unit, s.dimensions, start, s.high_res)][check_value(s.value, s.unit)] += 1
    items = []
    for (name, unit, dims, start, high_res), counts in groups.items():
        values = sorted(counts)
        for i in range(0, len(values), MAX_VALUES_PER_DATUM):      # one item holds at most 150 distinct values
            chunk = values[i:i + MAX_VALUES_PER_DATUM]
            item = {"MetricName": name, "Unit": unit, "Dimensions": to_dimensions(dict(dims)),
                    "Timestamp": datetime.fromtimestamp(start, tz=timezone.utc),
                    "Values": chunk, "Counts": [float(counts[v]) for v in chunk]}
            if high_res:
                item["StorageResolution"] = 1
            items.append(item)
    return items


def batches(items: list[dict], max_items: int = 1000, max_bytes: int = 800_000) -> Iterator[list[dict]]:
    """Split items so that no request exceeds the item count or an approximate payload size (limit: 1 MB)."""
    current, size = [], 0
    for item in items:
        item_size = len(json.dumps(item, default=str))
        if current and (len(current) >= max_items or size + item_size > max_bytes):
            yield current
            current, size = [], 0
        current.append(item)
        size += item_size
    if current:
        yield current


class MetricsEmitter:
    """`client` is anything with put_metric_data(**kwargs): a boto3 client, a Stubber-wrapped client, a fake."""

    def __init__(self, client, namespace, *, default_dimensions=None, flush_at=500, clock=time.time):
        self._client, self.namespace, self._defaults = client, namespace, dict(default_dimensions or {})
        self._flush_at, self._clock = flush_at, clock
        self._samples: list[Sample] = []
        self._unsent: list[dict] = []
        self._lock = threading.Lock()

    def record(self, name, value, unit="None", *, high_res=False, **dims):
        check_value(value, unit)                                # fail at the call site, not at flush time
        merged = tuple(sorted({**self._defaults, **dims}.items()))
        with self._lock:
            self._samples.append(Sample(name, value, unit, merged, self._clock(), high_res))
            full = len(self._samples) >= self._flush_at
        if full:
            self.flush()

    def count(self, name, value=1, **dims):
        self.record(name, value, "Count", **dims)

    @contextmanager
    def timer(self, name, **dims):
        started = time.perf_counter()
        try:
            yield
        finally:
            self.record(name, (time.perf_counter() - started) * 1000, "Milliseconds", **dims)

    def flush(self) -> int:
        """Send everything buffered. Unsent items stay buffered when a request fails and the error propagates."""
        with self._lock:
            pending, self._samples = self._samples, []
            items, self._unsent = self._unsent + aggregate(pending), []
        chunks = list(batches(items))
        sent = 0
        for i, chunk in enumerate(chunks):
            try:
                self._client.put_metric_data(Namespace=self.namespace, MetricData=chunk)
            except Exception:
                with self._lock:
                    self._unsent = [item for c in chunks[i:] for item in c] + self._unsent
                raise
            sent += len(chunk)
        return sent

    def __enter__(self): return self
    def __exit__(self, *exc): self.flush()
```

```python
with MetricsEmitter(cw, "QA/Orders", default_dimensions={"Service": "orders-api"}) as metrics:
    metrics.count("OrdersCreated")                          # Count, summed per minute
    with metrics.timer("CreateOrder", Route="/orders"):     # Milliseconds, percentiles available
        ...
# leaving the block flushes; in a long-running service call metrics.flush() from a timer thread or a signal handler
```

Design choices worth keeping: validation at `record` time (a bad value fails where it was produced); a `clock` and a `client` seam for tests; unsent items survive a failed request; the emitter never starts threads on its own. In a request path wrap `flush()` in `try/except Exception` and log, so a monitoring outage never breaks a request.

## Reading with `get_metric_data`

`get_metric_data` is the primary read API: up to 500 queries per request, metric math across them, and results for many metrics in one call.

| Field | Notes |
|-------|-------|
| `Id` | Unique in the request; first character lowercase, then letters, digits, `_` |
| `MetricStat` | `Metric` (namespace, name, **all** dimensions), `Period`, `Stat` (`Sum`, `Average`, `p99`, ...), optional `Unit` |
| `Expression` | Metric math over other `Id`s (`100 * errors / total`, `SUM(METRICS())`); use instead of `MetricStat`, not with it |
| `ReturnData` | `False` hides an input that exists only to feed an expression (default `True`) |
| `ScanBy` | `TimestampDescending` (**default**, newest first) or `TimestampAscending`; decides which datapoints a paginated read returns first |
| `MaxDatapoints` | Page size, default 100,800; when more exist the response carries `NextToken` |
| `StartTime` / `EndTime` | Start inclusive, end exclusive; start is rounded down (minute for data under 15 days old); aligned boundaries are served faster |
| Result | `MetricDataResults[]` with `Id`, `Label`, `Timestamps`, `Values`, `StatusCode` (`Complete`, `PartialData`, `InternalError`, `Forbidden`), `Messages` |

```python
# app/reader.py (excerpt)
def fetch(client, queries, start, end) -> dict[str, list[tuple[datetime, float]]]:
    """GetMetricData with NextToken followed; {query_id: [(timestamp, value), ...]} oldest first."""
    series = {q["Id"]: [] for q in queries if q.get("ReturnData", True)}
    paginator = client.get_paginator("get_metric_data")              # follows NextToken
    for page in paginator.paginate(MetricDataQueries=queries, StartTime=start, EndTime=end,
                                   ScanBy="TimestampAscending"):
        for result in page["MetricDataResults"]:
            if result["StatusCode"] in ("InternalError", "Forbidden"):
                raise RuntimeError(f"{result['Id']}: {result['StatusCode']} {result.get('Messages')}")
            series.setdefault(result["Id"], []).extend(zip(result["Timestamps"], result["Values"]))
    return {k: sorted(v) for k, v in series.items()}                  # pages of one query arrive separately
```

A metric math query (error percentage per minute from two counters):

```python
def stat(query_id, name, stat="Sum"):
    return {"Id": query_id, "ReturnData": False, "MetricStat": {
        "Metric": {"Namespace": "QA/Orders", "MetricName": name, "Dimensions": DIMS}, "Period": 60, "Stat": stat}}

queries = [stat("errors", "OrdersFailed"), stat("total", "OrdersCreated"),
           {"Id": "rate", "Expression": "100 * errors / total", "Label": "failure %"}]
series = fetch(cw, queries, now - dt.timedelta(hours=1), now)        # only "rate" is returned
```

- **Order:** the default is newest first. Never rely on it; sort by timestamp (as `fetch` does) or pass `ScanBy`.
- **Gaps:** periods without datapoints are absent from `Timestamps`. Pair `Timestamps` with `Values`; never assume one value per period.
- **Polling with a deadline** is the only reliable way to wait for data: `wait_for(cw, queries, predicate, timeout=300, interval=15)` in `app/reader.py` calls `fetch` until the predicate holds ([05](./05-testing.md), [06](./06-moto-gaps-smoke-ci.md#real-account-smoke-test)).

### `get_metric_statistics` or `get_metric_data`

| | `get_metric_data` | `get_metric_statistics` |
|---|-------------------|-------------------------|
| Metrics per call | Up to 500 queries | One |
| Metric math, Metrics Insights, anomaly band | Yes | No |
| Pagination | `NextToken` | None: more than **1,440** datapoints is an error |
| Order | Controlled with `ScanBy` | **Not chronological** |
| Statistics per call | One per query | Up to 5 standard, or up to 10 percentiles (not both) |
| Billing | Priced differently from `get_metric_statistics` (see the pricing page) | Per request |
| Use for | Everything new, dashboards, tests | One-off reads, old scripts |

## Listing with `list_metrics`

```python
paginator = cw.get_paginator("list_metrics")
for page in paginator.paginate(Namespace="QA/Orders", Dimensions=[{"Name": "Service"}], RecentlyActive="PT3H"):
    for metric in page["Metrics"]:
        print(metric["MetricName"], {d["Name"]: d["Value"] for d in metric["Dimensions"]})
```

- Filters match **exactly**: namespace, metric name, and dimension *names* (a dimension filter with only `Name` matches metrics that have that dimension and possibly others; add `Value` to pin it, up to 10 filters).
- Up to **500 metrics per page**; follow `NextToken` (the paginator does).
- `RecentlyActive="PT3H"` (the only valid value) limits results to metrics with datapoints in roughly the last three hours.
- A new metric can take **up to 15 minutes** to appear, and metrics idle for two weeks do not appear at all. For "does it exist right now" checks use `get_metric_data`.

## Embedded Metric Format (EMF)

EMF turns **one structured log line** into log data *and* metrics: you print JSON that contains a `_aws` metadata block, and CloudWatch Logs extracts the metrics when the line arrives. There is no `PutMetricData` call, no batching code and no throttling on your side; it suits Lambda, containers with the `awslogs` driver and anything already writing to CloudWatch Logs.

```json
{"_aws": {"Timestamp": 1700000000000, "CloudWatchMetrics": [{"Namespace": "App/Orders",
  "Dimensions": [["Route"]], "Metrics": [{"Name": "Latency", "Unit": "Milliseconds"}, {"Name": "Orders", "Unit": "Count", "StorageResolution": 1}]}]},
 "Route": "/orders", "Latency": [123.4, 98.0], "Orders": 1, "order_id": "o-1"}
```

| Rule | Value |
|------|-------|
| Root | Valid JSON object with `_aws`; metric values and dimension values are **top-level** members (no nesting) |
| `Timestamp` | Epoch milliseconds, at most 14 days old and 2 hours ahead, or the metric is not published |
| `Dimensions` | Array of **dimension sets** (arrays of key names), up to 30 keys per set; **every set creates its own metric** |
| `Metrics` | Up to **100** definitions per event; each value is a number or an **array of up to 100 numbers** |
| `Unit`, `StorageResolution` | As in `PutMetricData`; resolution `1` or `60` |
| Other members | Free-form properties (`order_id`): searchable in Logs Insights, not dimensions |
| Size | The usual log event limit (1 MB) |
| Delivery | At least once: duplicates are possible |
| Needs | A **Standard**-class log group that receives the line (agent, `awslogs`, Lambda); the Infrequent Access class does not support EMF |
| Cost | Extracted metrics are billed as custom metrics plus log ingestion |

```python
# app/emf.py (core of emf_line; validation of units, counts and size is in the module)
root = {**(properties or {}), **dimensions}                   # properties and dimension values live at the root
for name, (value, unit) in metrics.items():
    root[name] = value                                        # a number, or a list of numbers
root["_aws"] = {"Timestamp": timestamp_ms or int(time.time() * 1000),
                "CloudWatchMetrics": [{"Namespace": namespace, "Dimensions": [sorted(dimensions)],
                                       "Metrics": [{"Name": n, "Unit": u} for n, (_, u) in metrics.items()]}]}
print(json.dumps(root, separators=(",", ":")))                # one line = one log event; stdout is shipped by the driver
```

**The `aws-embedded-metrics` library** (Python, current release 3.5.0) builds and sends these lines for you:

```python
import os
os.environ["AWS_EMF_ENVIRONMENT"] = "Local"           # print EMF lines to stdout; omit on Lambda/ECS/EC2 to auto-detect
os.environ["AWS_EMF_NAMESPACE"] = "App/Orders"
os.environ["AWS_EMF_SERVICE_NAME"] = "orders-api"

from aws_embedded_metrics import metric_scope
from aws_embedded_metrics.storage_resolution import StorageResolution


@metric_scope
def handle_order(order_id: str, metrics):
    metrics.set_dimensions({"Route": "/orders"})         # replaces the DEFAULT dimension set (LogGroup, ServiceName, ServiceType)
    metrics.put_metric("Latency", 123.4, "Milliseconds")
    metrics.put_metric("Latency", 98.0, "Milliseconds")   # same name twice becomes an array of values
    metrics.put_metric("Orders", 1, "Count", StorageResolution.HIGH)
    metrics.set_property("order_id", order_id)            # not a dimension
```

- **Pass the unit as a string** (`"Milliseconds"`): `put_metric` takes `str`, and passing the `Unit` enum member makes serialization fail in 3.5.0.
- **Default dimensions:** unless you call `set_dimensions`, the library adds `LogGroup`, `ServiceName` and `ServiceType`, which multiplies metrics per log group and service.
- **Configuration** is read from `AWS_EMF_*` variables once, at first use; tests set the attributes of `aws_embedded_metrics.config.get_config()` instead ([05](./05-testing.md#emf-and-json-logging)).
- Outside Lambda the library sends lines to a CloudWatch agent over TCP by default; without an agent it logs connection errors and drops the data. In containers that use the `awslogs` driver set `AWS_EMF_ENVIRONMENT=Local` so the lines go to stdout, or run the agent.
- EMF also publishes processing metrics in the `AWS/Logs` namespace, so failed extraction (parse or validation errors) is observable.

### EMF, `PutMetricData` or OpenTelemetry

| | `PutMetricData` | EMF | OpenTelemetry (OTLP) |
|---|-----------------|-----|----------------------|
| Call at runtime | One API request per flush | A log line | OTel SDK or collector |
| Failure handling | Yours (throttling, retries) | Log shipping handles it | The exporter handles it |
| Rich per-event context | No | Yes, searchable in Logs Insights | Attributes and labels |
| Granularity limits | 30 dimensions | 30 keys per set, 100 metrics per event | Up to 150 labels per data point |
| Use when | Services without a log pipeline, scripts, tests | Lambda and containers that already log to CloudWatch | New workloads that want vendor-neutral instrumentation |

## Exceptions and Retries

Catch the modeled exception on the client, not a code string. Names look unusual because they follow the service model:

| `Error.Code` | `client.exceptions.<Name>` | Typical cause |
|--------------|---------------------------|---------------|
| `InvalidParameterValue` | `InvalidParameterValueException` | NaN or out-of-range value, a malformed field |
| `InvalidParameterCombination` | `InvalidParameterCombinationException` | `Statistics` together with `ExtendedStatistics` in `get_metric_statistics` |
| `MissingParameter` | `MissingRequiredParameterException` | A required field is absent |
| `LimitExceeded` | `LimitExceededFault` | Alarm quota reached |
| `ResourceNotFound` | `ResourceNotFound` | `set_alarm_state` on an alarm that does not exist (HTTP 404) |
| `InvalidNextToken` | `InvalidNextToken` | A bad `NextToken` passed to `get_metric_data` |
| `InvalidFormat` | `InvalidFormatFault` | `StateReasonData` is not valid JSON |
| `InternalServiceError` | `InternalServiceFault` | HTTP 500: retried by the client |

- **Throttling is not a modeled exception** of this client. It surfaces as a `ClientError` with a throttling code, and the `standard` retry mode retries it with backoff ([Foundations](../foundations/01-clients-config-errors.md)).
- botocore raises `ParamValidationError` **before** sending (empty namespace, missing field, wrong type): it needs no AWS and is a cheap test target.
- A retry after an ambiguous failure (a timeout) can count a counter twice; the emitter above accepts that trade-off for simplicity.

## Quick Rules

1. **Aggregate locally, send once a minute,** with `Values`/`Counts` when percentiles matter.
2. **Keep the AWS call at the edge:** payload builders are pure functions, the client is injected.
3. **Sort what you read.** `get_metric_data` defaults to newest first and `get_metric_statistics` is unordered.
4. **Follow `NextToken`.** Use the paginators for `get_metric_data`, `list_metrics` and `describe_alarms`.
5. **Poll with a deadline,** never `sleep`, and read completed periods.
6. **Pass UTC-aware timestamps** and a `Unit` on every datapoint.
7. **Catch modeled exceptions** (`cw.exceptions.InvalidParameterValueException`, `LimitExceededFault`, `ResourceNotFound`).
8. **Use EMF where logs already flow to CloudWatch,** and keep its dimension sets small: each set is another metric.
9. **Never put identifiers in dimensions;** as EMF properties or log fields they create no metrics.
10. **Prefer OpenTelemetry for new instrumentation** if you also want PromQL and high cardinality; keep this API for AWS-native alarms.

---
## See also
- [Amazon CloudWatch — Overview](./index.md)
- [Amazon CloudWatch — Metrics: Core Concepts](./01-metrics-core-concepts.md)
- [Amazon CloudWatch — Alarms & Dashboards](./03-alarms-dashboards.md)
- [Amazon CloudWatch — Testing CloudWatch-Based Systems](./05-testing.md)
- [AWS Foundations — Clients, Config, Retries & Errors](../foundations/01-clients-config-errors.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [OpenTelemetry — Metrics & Logs](../../libs/opentelemetry/03-metrics-logs.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
