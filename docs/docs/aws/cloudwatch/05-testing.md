---
date: 2026-10-22 12:00:00
tags:
  - aws
  - cloudwatch
  - testing
  - pytest
  - moto
  - observability
---

# Amazon CloudWatch — Testing CloudWatch-Based Systems

## What to Test Where

| Level | What | CloudWatch |
|-------|------|------------|
| **Unit** | Metric payload builders, aggregation and batching, EMF lines, JSON log records, alarm and dashboard definitions, log batching | None: call the function with plain data |
| **Client contract** | The exact `PutMetricData`, `put_metric_alarm`, `put_metric_filter` requests, error handling, pagination by `NextToken`, Logs Insights polling | `botocore.stub.Stubber` ([Foundations](../foundations/02-credentials-iam-local-testing.md)) |
| **Integration** | Emit then read back, dimension combinations, `list_metrics`, alarm definitions and states, log put/filter/get, retention checks | **moto** `mock_aws`, or the moto server for other processes |
| **Compliance** | Every queue has a DLQ alarm, every service has CPU and task alarms, actions are set, every log group has retention | Pure functions over `describe_alarms` and `describe_log_groups` output: recorded, moto, or a real account |
| **Smoke** | Datapoints really arrive, a forced alarm state is recorded, IAM and alarm actions work | A real account ([06](./06-moto-gaps-smoke-ci.md#real-account-smoke-test)) |

CloudWatch is a **time-series and evaluation** service, and moto is a **storage** emulator for it: it stores and returns what you put, but it never evaluates alarms, computes percentiles or runs Insights queries ([06](./06-moto-gaps-smoke-ci.md#what-moto-does-not-emulate)). Design tests so that the logic worth testing (what you send, what you define, what you do with what you read) is pure or contract-tested, and let moto cover the round trip.

## Project Layout

```text
app/        metrics.py  emf.py  jsonlog.py  logs.py  reader.py  alarms.py  alarm_policy.py  alarm_history.py  dashboards.py  service.py
tests/
  conftest.py                                                 fixtures: fake credentials, moto, unique names, FakeCloudWatch
  test_metrics_pure.py  test_emf_jsonlog.py  test_dashboards.py          pure functions, no AWS
  test_cloudwatch_stubber.py  test_logs_stubber.py  test_alarm_history.py  request shapes, errors, pagination, polling
  test_cloudwatch_moto.py  test_logs_helpers.py  test_emf_library.py     round trips, compliance, aws-embedded-metrics
  test_server_mode.py  test_moto_gaps.py  test_smoke_aws.py              moto over HTTP, pinned moto gaps, real account
```

## Fixtures

```python
# tests/conftest.py
@pytest.fixture(autouse=True)
def aws_env(request, monkeypatch):
    """Fake credentials and a fixed region: nothing in the suite can reach a real account by accident."""
    if request.node.get_closest_marker("aws_smoke"):
        return                                    # smoke tests use the role that CI or the developer provides
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_CONFIG_FILE", "/dev/null")
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", "/dev/null")
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    monkeypatch.delenv("AWS_ENDPOINT_URL", raising=False)


@pytest.fixture
def aws():
    with mock_aws():
        yield

@pytest.fixture
def cw(aws):   return boto3.client("cloudwatch")
@pytest.fixture
def logs(aws): return boto3.client("logs")

@pytest.fixture
def unique():
    run = uuid.uuid4().hex[:8]
    return lambda base: f"{base}-{run}"


class FakeCloudWatch:
    """Records PutMetricData calls; optionally fails the first N of them."""
    def __init__(self, fail_first: int = 0):
        self.calls, self._fail = [], fail_first

    def put_metric_data(self, **kwargs):
        if self._fail:
            self._fail -= 1
            raise RuntimeError("boom")
        self.calls.append(kwargs)

    @property
    def datums(self):
        return [d for call in self.calls for d in call["MetricData"]]
```

```ini
# pytest.ini
[pytest]
markers =
    aws_smoke: talks to a real AWS account; run with -m aws_smoke and RUN_AWS_SMOKE=1
addopts = --strict-markers -m "not aws_smoke"
```

`aws_env` gives every test fake credentials and removes `AWS_PROFILE`; the generic reasoning is in [Foundations](../foundations/02-credentials-iam-local-testing.md). The `aws_smoke` marker is deselected by default, and the autouse fixture steps aside for it so a smoke test uses the real credentials. `unique` keeps names collision-free for the moto server, a real account and `pytest -n`.

## Pure Payload Tests

```python
# tests/test_metrics_pure.py (excerpt)
def test_aggregate_groups_by_minute_and_keeps_raw_values():
    t0 = 1_700_000_020          # 40 s into a minute
    items = aggregate([sample(5, t0), sample(5, t0 + 1), sample(50, t0 + 2), sample(7, t0 + 30)])
    first, second = sorted(items, key=lambda i: i["Timestamp"])
    assert first["Values"] == [5.0, 50.0] and first["Counts"] == [2.0, 1.0]      # raw values: percentiles keep working
    assert second["Values"] == [7.0]                                              # t0 + 30 s is in the next minute


def test_batches_respect_the_item_limit():
    items = [{"MetricName": "m", "Value": float(i)} for i in range(2500)]
    assert [len(b) for b in batches(items, max_items=1000)] == [1000, 1000, 500]
```

Pure tests are where you pin the **limits**: 150 values per datum, 1000 items per request, 26 bytes per log event, the 24-hour batch span, 30 dimensions. They run in milliseconds and need no fixtures.

## Asserting Emitted Datapoints

Inject the emitter into the code under test and give the emitter a **fake client** that records requests. The test asserts what would have been sent, with no AWS and no time dependence:

```python
# app/service.py
def handle_order(order: dict, metrics) -> str:
    with metrics.timer("HandleOrder", Operation="handle_order"):
        if order.get("amount", 0) <= 0:
            metrics.count("OrdersRejected", Reason="bad_amount")
            return "rejected"
        metrics.count("OrdersAccepted")
        return "accepted"
```

```python
# tests/test_metrics_pure.py (excerpt)
def test_service_emits_the_expected_metrics(fake_cw):
    with MetricsEmitter(fake_cw, "App/Orders", default_dimensions={"Service": "orders"}) as metrics:
        assert handle_order({"amount": 10}, metrics) == "accepted"
        assert handle_order({"amount": 0}, metrics) == "rejected"
    names = {d["MetricName"]: d for d in fake_cw.datums}
    assert set(names) == {"HandleOrder", "OrdersAccepted", "OrdersRejected"}
    assert {"Name": "Reason", "Value": "bad_amount"} in names["OrdersRejected"]["Dimensions"]
```

For a clock-dependent test pass `clock=` to the emitter (a list iterator's `__next__` is enough). To exercise the real serialisation too, give the emitter a moto client and read back with `fetch` ([below](#moto-round-trips)).

## Stubber: Request Shape and Errors

Stubber validates parameters against the **service model**, so a misspelt field or a wrong type fails with no AWS at all. That makes it the right tool for alarm definitions:

```python
# tests/test_cloudwatch_stubber.py (excerpt)
BUILDERS = [alarms.dlq_depth("orders-dlq", TOPIC), alarms.ecs_cpu("prod", "orders-api", TOPIC),
            alarms.bedrock_latency_p99("anthropic.claude-sonnet-4-5", TOPIC),
            alarms.error_rate("App/Orders", "Errors", "Requests", TOPIC)]          # ... all builders

@pytest.mark.parametrize("kwargs", BUILDERS, ids=lambda k: k["AlarmName"])
def test_alarm_definitions_match_the_service_model(kwargs):
    cw = boto3.client("cloudwatch")
    with Stubber(cw) as stub:
        stub.add_response("put_metric_alarm", {}, expected_params=kwargs)
        cw.put_metric_alarm(**kwargs)
        stub.assert_no_pending_responses()


def test_service_error_keeps_the_items_buffered():
    cw = boto3.client("cloudwatch")
    emitter = MetricsEmitter(cw, "App")
    emitter.count("Hits")
    with Stubber(cw) as stub:
        stub.add_client_error("put_metric_data", service_error_code="InvalidParameterValue", http_status_code=400)
        with pytest.raises(ClientError) as err:
            emitter.flush()
        assert isinstance(err.value, cw.exceptions.InvalidParameterValueException)     # modeled exception class
        stub.add_response("put_metric_data", {})
        assert emitter.flush() == 1                                                    # retried from the buffer


def test_fetch_follows_next_token_and_merges_pages():
    ...  # first response carries NextToken="t1"; the second call must carry NextToken="t1" in expected_params
```

Stubber is also the only way to test what moto does not implement: composite alarms, anomaly detectors, `describe_alarm_history` polling (`test_alarm_history.py`), Logs Insights polling (`test_logs_helpers.py`: `Running` then `Complete`, `Failed`, and a timeout that must call `stop_query`) and `put_metric_filter` or `put_subscription_filter` shapes (`test_logs_stubber.py`). Remember: Stubber never retries, so it cannot test throttling behaviour ([Foundations](../foundations/02-credentials-iam-local-testing.md#stubber-exact-requests-and-errors)).

## moto Round Trips

```python
# tests/test_cloudwatch_moto.py (excerpt)
def test_emitted_counts_can_be_read_back(cw, unique):
    ns = unique("QA/Orders")
    with MetricsEmitter(cw, ns, default_dimensions={"Service": "api"}) as emitter:
        for _ in range(3):
            emitter.count("OrdersCreated")
    start, end = window()                                           # now - 10 min .. now + 1 min
    series = fetch(cw, [metric_query("m", ns, "OrdersCreated", {"Service": "api"}, "Sum")], start, end)
    assert sum(v for _, v in series["m"]) == 3


def test_every_dimension_combination_is_its_own_metric(cw, unique):
    ns = unique("QA/Dims")
    cw.put_metric_data(Namespace=ns, MetricData=[
        {"MetricName": "Hits", "Value": 1, "Dimensions": [{"Name": "Service", "Value": "api"}]},
        {"MetricName": "Hits", "Value": 5, "Dimensions": [{"Name": "Service", "Value": "api"}, {"Name": "Env", "Value": "test"}]},
    ])
    assert len(cw.list_metrics(Namespace=ns)["Metrics"]) == 2
    start, end = window()
    only_service = fetch(cw, [metric_query("m", ns, "Hits", {"Service": "api"})], start, end)
    assert sum(v for _, v in only_service["m"]) == 1                # the 5 lives under a different identity


def test_wait_for_fails_at_the_deadline(cw, unique):
    q = [metric_query("m", unique("QA/Never"), "Nothing")]
    with pytest.raises(AssertionError, match="not met within"):
        wait_for(cw, q, lambda s: bool(s["m"]), timeout=0.3, interval=0.1)
```

Additional moto tests in the suite: `list_metrics` returns 500 then 1 over two pages for 501 metrics; an alarm definition round-trips through `describe_alarms` (`TreatMissingData`, `AlarmActions`); `set_alarm_state` is visible in `describe_alarms(StateValue="ALARM")`; a missing alarm raises `cw.exceptions.ResourceNotFound`; NaN raises `InvalidParameterValueException`; a dashboard round-trips through `put_dashboard` and `get_dashboard`. Use **unique namespaces** (`unique("QA/Orders")`) so tests stay independent under `pytest -n`, the moto server and real accounts.

### Logs

```python
# tests/test_logs_helpers.py (excerpt)
def test_rejected_events_are_not_silently_dropped(logs, unique):
    group = unique("/app/orders")
    logs.create_log_group(logGroupName=group)
    logs.create_log_stream(logGroupName=group, logStreamName="s1")
    too_old = int((datetime.now(timezone.utc) - timedelta(days=20)).timestamp() * 1000)
    with pytest.raises(RejectedEvents):
        put_events(logs, group, "s1", [ev(too_old, "old")])                    # HTTP 200 with rejectedLogEventsInfo
```

moto stores events and reports `rejectedLogEventsInfo` for events older than 14 days or more than 2 hours ahead, so batch and rejection logic is testable, as are `filter_log_events` with plain terms, `get_log_events` pagination and `put_retention_policy`. JSON filter patterns, metric filters and Insights are not evaluated ([06](./06-moto-gaps-smoke-ci.md#what-moto-does-not-emulate)).

## Alarm Compliance Checks

Compliance checks are **pure functions over alarm dictionaries**, so the same code checks recorded fixtures in the unit suite, moto in CI and the real account in a scheduled job:

```python
# app/alarm_policy.py (excerpt)
def find(alarms, namespace, metric, **dims):
    return [a for a in alarms if a.get("Namespace") == namespace and a.get("MetricName") == metric and dims_of(a) == dims]

def dlq_problems(alarms, dlq):
    found = find(alarms, "AWS/SQS", "ApproximateNumberOfMessagesVisible", QueueName=dlq)
    if not found:
        return [f"{dlq}: no depth alarm"]
    problems = []
    for a in found:
        if a["Threshold"] != 0 or a["ComparisonOperator"] != "GreaterThanThreshold":
            problems.append(f"{a['AlarmName']}: must fire when depth > 0")
        if a.get("TreatMissingData") != "notBreaching":
            problems.append(f"{a['AlarmName']}: TreatMissingData must be notBreaching, got {a.get('TreatMissingData')!r}")
        if not a.get("AlarmActions"):
            problems.append(f"{a['AlarmName']}: no AlarmActions")
    return problems
```

```python
# tests/test_cloudwatch_moto.py (excerpt)
def test_alarm_compliance_over_describe_alarms_output(cw):
    cw.put_metric_alarm(**alarms.dlq_depth("orders-dlq", TOPIC))
    cw.put_metric_alarm(**alarms.ecs_cpu("prod", "orders-api", TOPIC))
    found = [a for p in cw.get_paginator("describe_alarms").paginate() for a in p["MetricAlarms"]]
    assert all_problems(found, ["orders-dlq"], [("prod", "orders-api")]) == []
    assert all_problems(found, ["orders-dlq", "billing-dlq"], [("prod", "billing-api")]) == [
        "billing-dlq: no depth alarm", "prod/billing-api: no CPUUtilization alarm"]
```

A second test pins the messages for a DLQ alarm that keeps the default `TreatMissingData` and has no action. To check the real estate, feed the same function the output of `describe_alarms` and the queue and service lists from `sqs.list_queues` and `ecs.list_services` (see the SQS and ECS guides), inside a scheduled job marked `aws_smoke`. The log counterpart is `assert groups_without_retention(logs, prefix="/ecs/") == []`.

Compare `TreatMissingData` to a **specific** value per alarm role: "the field exists" also passes for the default `missing`, which is wrong for a DLQ alarm.

## EMF and JSON Logging

```python
# tests/test_emf_jsonlog.py (excerpt; a second test feeds a `logging` record through `JsonFormatter` and parses the output)
def test_emf_line_structure():
    line = emf_line("App/Orders", {"Latency": (123.4, "Milliseconds"), "Orders": ([1, 1, 1], "Count")},
                    {"Service": "api", "Env": "test"}, properties={"order_id": "o-1"}, timestamp_ms=1_700_000_000_000)
    doc = json.loads(line)
    directive = doc["_aws"]["CloudWatchMetrics"][0]
    assert directive["Dimensions"] == [["Env", "Service"]]
    assert doc["Latency"] == 123.4 and doc["Service"] == "api"        # values live at the root, next to the dimensions
    assert "\n" not in line                                           # one log event = one line
```

The `aws-embedded-metrics` library reads its configuration once, so set the attributes of the config object, not the environment, and capture stdout:

```python
# tests/test_emf_library.py (excerpt)
@pytest.fixture(autouse=True)
def emf_local(monkeypatch):
    config = get_config()                                         # read from AWS_EMF_* variables once, at first use
    monkeypatch.setattr(config, "environment", "Local")           # write EMF lines to stdout, no agent needed
    monkeypatch.setattr(config, "namespace", "App/Orders")
    monkeypatch.setattr(config, "service_name", "orders-api")

def test_library_writes_one_emf_line_to_stdout(capsys):
    @metric_scope
    def handle(order_id, metrics):
        metrics.set_dimensions({"Route": "/orders"})
        metrics.put_metric("Latency", 123.4, "Milliseconds")

    handle("o-1")
    directive = json.loads(capsys.readouterr().out.strip())["_aws"]["CloudWatchMetrics"][0]
    assert directive["Dimensions"] == [["Route"]]
```

A second test pins the default dimension set (`LogGroup`, `ServiceName`, `ServiceType`) so an upgrade or a missing `set_dimensions` call is noticed. Whether CloudWatch **extracts** the metrics from the line cannot be tested locally: moto does not process EMF ([06](./06-moto-gaps-smoke-ci.md#what-moto-does-not-emulate)).

## moto Server Mode

`mock_aws` patches boto3 inside the test process. A service in another process (a worker container, a Celery worker) needs a real endpoint:

```python
# tests/test_server_mode.py (excerpt)
@pytest.fixture(scope="session")
def moto_endpoint():
    server = ThreadedMotoServer(ip_address="127.0.0.1", port=0, verbose=False)
    server.start()
    host, port = server.get_host_and_port()
    yield f"http://{host}:{port}"
    server.stop()

def test_metrics_over_http(moto_endpoint, unique):
    cw = boto3.client("cloudwatch", endpoint_url=moto_endpoint)           # credentials come from the aws_env fixture
    with MetricsEmitter(cw, unique("QA/Server")) as emitter:
        emitter.count("Hits")
    ...
```

State survives between tests until `POST /moto-api/reset` (a test pins that `list_metrics` is empty afterwards). Use unique names there too.

## Running the Suite

- `pytest -n 4` works: every test owns its moto backend and unique names; the server fixture is session-scoped per worker.
- `-m "not aws_smoke"` is the default through `addopts`; the scheduled job runs `-m aws_smoke` with `RUN_AWS_SMOKE=1`.

## Quick Rules

1. **Make payloads pure.** Builders for metrics, EMF lines, log records, alarms and dashboards need no AWS to test.
2. **Inject the emitter and give it a fake client** to assert what a service would send.
3. **Use Stubber to validate request shapes** against the model, including every alarm definition.
4. **Use moto for round trips,** with unique namespaces and names per test.
5. **Do not expect moto to evaluate anything:** alarms, percentiles, math, Insights and EMF extraction need Stubber or a real account.
6. **Write compliance checks as pure functions** and compare specific values (`notBreaching`), not "field present".
7. **Never `sleep`:** wait on a condition with a deadline.
8. **Keep one fake-credentials autouse fixture** and step aside only for the tagged smoke tests.

---
## See also
- [Amazon CloudWatch — Overview](./index.md)
- [Amazon CloudWatch — boto3 in Python](./02-boto3-python.md)
- [Amazon CloudWatch — Alarms & Dashboards](./03-alarms-dashboards.md)
- [Amazon CloudWatch — moto Gaps, Smoke Tests & CI](./06-moto-gaps-smoke-ci.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [Amazon SQS — Testing SQS-Based Systems](../sqs/05-testing.md)
- [Amazon SNS — Testing](../sns/04-testing.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
- [Performance Testing](../../performance-testing/index.md)
