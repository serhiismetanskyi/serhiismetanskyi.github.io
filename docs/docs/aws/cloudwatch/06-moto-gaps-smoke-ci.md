---
date: 2026-10-22 12:00:00
tags:
  - aws
  - cloudwatch
  - testing
  - moto
  - ci
  - observability
---

# Amazon CloudWatch — moto Gaps, Smoke Tests & CI

## What moto Does Not Emulate

Differences between moto 5.x and the real service that matter to tests. Pin each one with a test (`tests/test_moto_gaps.py` is the pattern), so a moto upgrade that changes the emulation fails a test instead of surprising you.

| Area | moto | Real service | Test it with |
|------|------|--------------|--------------|
| **Alarm evaluation** | Alarms are stored and **never evaluated**: breaching data leaves the state alone | Evaluated every minute against real datapoints | Real account (smoke), or `set_alarm_state` |
| Initial alarm state | `OK` | `INSUFFICIENT_DATA` until the first evaluation | Do not assert the initial state against moto |
| **Alarm actions** | `set_alarm_state` changes the state but publishes **nothing** to SNS or any other target | Actions for the new state run | Real account with an SNS topic and a queue as the sink |
| `describe_alarm_history` | `NotImplementedError` | History of state and configuration changes (30 days) | Stubber for the polling code; real account for the data |
| `put_composite_alarm` | `NotImplementedError` | Rule-based alarm | Stubber for the call shape |
| Anomaly detection | `put_anomaly_detector` and `describe_anomaly_detectors` raise `NotImplementedError` | Learned bands | Stubber |
| **Percentiles** | `ExtendedStatistics` such as `p99` return datapoints **without** values | Computed from raw values | Compute percentiles yourself in pure tests; real account |
| **Metric math** | An `Expression` query comes back with empty `Timestamps` and `Values` | Evaluated | Test the query shape with Stubber; evaluate in smoke |
| `MaxDatapoints` and `NextToken` | `MaxDatapoints` is ignored; no `NextToken` | Pages of `MaxDatapoints` | Stubber (`test_fetch_follows_next_token_and_merges_pages`) |
| Result timestamps | Returned as published (seconds preserved) | Stamped with the **start of the period** | Never assert exact timestamps; compare values and counts |
| Request validation | Accepts timestamps 30 days old or 5 hours ahead, an unknown `Unit`, `StorageResolution=5`, 1001 metrics and 31 dimensions | Rejected | Pure tests of your own limits (`check_value`, `to_dimensions`, `batches`) |
| Metric filters | Stored and listed; they **never create metrics** | Matching events become metric datapoints | Real account; pure tests of the pattern constants |
| `test_metric_filter` | `NotImplementedError` | Tests a pattern against sample messages | Real account |
| `filter_log_events` patterns | Plain terms work; **JSON patterns (`{ $.level = "ERROR" }`) are ignored** and every event is returned | Evaluated | Filter in your own code for assertions, or smoke |
| **Logs Insights** | `start_query` completes at once and returns stored events; **`filter`, `stats` and `parse` are not evaluated** | Real query engine | Stubber for the polling code; real account for query text |
| EMF extraction | A line with `_aws` is just a log event: no metric appears | Metrics are extracted on arrival | Pure tests of the line; smoke |
| Log retention values | `retentionInDays=15` is accepted | Only the allowed values | Validate in your code (`set_retention`) |
| Log class | `INFREQUENT_ACCESS` is accepted but not reported back | Class applies and restricts features | Not testable here |
| Delays, throttling, quotas | None: data is readable immediately | Minutes of delay, 3 alarm writes per second | Real account |
| IAM | Not enforced | Enforced, including `cloudwatch:namespace` conditions | Real account |

`put_metric_data` with `Values`/`Counts` and `StatisticValues`, `get_metric_data` and `get_metric_statistics` for plain statistics (`Sum`, `Average`, `SampleCount`, `Maximum`), `list_metrics` with its 500-per-page pagination, `put_metric_alarm` and `describe_alarms` (including metric math definitions and `AlarmTypes`/`StateValue` filters), `put_dashboard`/`get_dashboard`, `put_log_events` with rejected-event reporting, `get_log_events` paging and `put_retention_policy` do work. The moto server also serves boto3's current CloudWatch protocol.

## Real-Account Smoke Test

Two things only a real account can prove: **datapoints arrive and can be read**, and **a forced alarm state is recorded**. Keep it to those, in a dedicated test account.

```python
# tests/test_smoke_aws.py (run with: RUN_AWS_SMOKE=1 SMOKE_ACCOUNT_ID=... pytest -m aws_smoke)
pytestmark = pytest.mark.aws_smoke
NAMESPACE = "QA/Smoke"
DIMENSIONS = [{"Name": "Suite", "Value": "smoke"}]


@pytest.fixture(scope="module")
def cw():
    if os.environ.get("RUN_AWS_SMOKE") != "1":
        pytest.skip("set RUN_AWS_SMOKE=1 to talk to a real account")
    identity = boto3.client("sts").get_caller_identity()
    assert identity["Account"] == os.environ["SMOKE_ACCOUNT_ID"], "refusing to run outside the test account"
    return boto3.client("cloudwatch")


def test_custom_metric_arrives(cw):
    marker = float(random.randint(10**6, 10**7))                  # a unique VALUE, so no new metric per run
    cw.put_metric_data(Namespace=NAMESPACE, MetricData=[
        {"MetricName": "Heartbeat", "Dimensions": DIMENSIONS, "Value": marker, "Unit": "Count"}])
    query = [metric_query("m", NAMESPACE, "Heartbeat", {"Suite": "smoke"}, stat="Maximum", period=60)]
    wait_for(cw, query, lambda series: marker in [v for _, v in series["m"]], timeout=300, interval=15)


@pytest.fixture
def alarm(cw):
    name = f"qa-smoke-{uuid.uuid4().hex[:8]}"
    cw.put_metric_alarm(AlarmName=name, Namespace=NAMESPACE, MetricName="Heartbeat", Dimensions=DIMENSIONS,
                        Statistic="Maximum", Period=60, EvaluationPeriods=1, Threshold=1e12,
                        ComparisonOperator="GreaterThanThreshold", TreatMissingData="notBreaching",
                        Tags=[{"Key": "purpose", "Value": "smoke-test"}])
    yield name
    cw.delete_alarms(AlarmNames=[name])                             # teardown runs even when the test fails


def test_forced_alarm_state_is_recorded_in_history(cw, alarm):
    cw.set_alarm_state(AlarmName=alarm, StateValue="ALARM", StateReason="smoke test")
    item = wait_for_state_update(cw, alarm, "ALARM", timeout=60)
    assert item["HistoryItemType"] == "StateUpdate"
```

Design notes:

- **Unique value, not unique metric.** Metrics cannot be deleted and every dimension combination is billed, so a unique namespace or dimension per run would pile up. One fixed metric plus a random `Value` proves arrival; run the job with a `concurrency` group so two runs do not interleave.
- **Deadline, not sleep.** `wait_for` polls every 15 seconds for up to 5 minutes; a new metric is typically readable within two minutes. Read the last ten minutes, not the current period only.
- **History, not state.** A forced state lasts until the next evaluation, often seconds, so `describe_alarm_history` (kept 30 days) is the durable evidence.
- **Safety belts:** the account check, the tagged alarm, `delete_alarms` in teardown, a role that cannot touch other namespaces.
- **To prove the action chain,** create an SNS topic whose policy allows `cloudwatch.amazonaws.com` to publish, subscribe an SQS queue ([SNS guide](../sns/index.md), [SQS guide](../sqs/index.md)), put the topic ARN into `AlarmActions`, force `ALARM`, and receive the notification: it is JSON with `AlarmName` and `NewStateValue`. This is the only test that catches a wrong ARN or a missing topic policy, because CloudWatch does not validate actions.
- **Compliance in the real account:** a scheduled `aws_smoke` job can feed `describe_alarms` and `describe_log_groups` output to `all_problems` and `groups_without_retention` ([05](./05-testing.md#alarm-compliance-checks)).

### IAM for the Test Role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {"Sid": "PutOnlyToTheSmokeNamespace", "Effect": "Allow", "Action": "cloudwatch:PutMetricData", "Resource": "*",
     "Condition": {"StringEquals": {"cloudwatch:namespace": "QA/Smoke"}}},
    {"Sid": "Read", "Effect": "Allow",
     "Action": ["cloudwatch:GetMetricData", "cloudwatch:ListMetrics", "cloudwatch:DescribeAlarms", "cloudwatch:DescribeAlarmHistory"],
     "Resource": "*"},
    {"Sid": "OnlySmokeAlarms", "Effect": "Allow",
     "Action": ["cloudwatch:PutMetricAlarm", "cloudwatch:SetAlarmState", "cloudwatch:DeleteAlarms", "cloudwatch:TagResource"],
     "Resource": "arn:aws:cloudwatch:eu-west-1:123456789012:alarm:qa-smoke-*"}
  ]
}
```

`PutMetricData` has no resource ARN, so the `cloudwatch:namespace` condition is the way to limit it. Creating a tagged alarm needs both `PutMetricAlarm` and `TagResource`. Credentials, OIDC trust and least privilege in general are in [Foundations](../foundations/02-credentials-iam-local-testing.md).

## GitHub Actions

```yaml
# .github/workflows/cloudwatch-tests.yml
name: cloudwatch-tests
on:
  pull_request:
  schedule: [{cron: "17 3 * * *"}]
  workflow_dispatch:

permissions:
  id-token: write          # lets the smoke job request an OIDC token
  contents: read

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.13"}
      - run: pip install boto3 "moto[cloudwatch,logs,sqs,sns,server]" pytest pytest-xdist aws-embedded-metrics
      - run: pytest -n auto                      # pytest.ini deselects aws_smoke

  smoke:
    if: github.event_name != 'pull_request'      # nightly and on demand, not on every pull request
    runs-on: ubuntu-latest
    concurrency: {group: cloudwatch-smoke, cancel-in-progress: false}
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/ci-cloudwatch-smoke
          aws-region: eu-west-1
      - uses: actions/setup-python@v5
        with: {python-version: "3.13"}
      - run: pip install boto3 "moto[cloudwatch,logs]" pytest aws-embedded-metrics
      - run: pytest -m aws_smoke
        env: {RUN_AWS_SMOKE: "1", SMOKE_ACCOUNT_ID: "123456789012"}
```

The unit job needs no secrets and runs on every pull request. The smoke job runs nightly and on demand, with a role that trusts the repository through OIDC (no stored keys).

## Flakiness Traps

| Trap | What happens | Remedy |
|------|--------------|--------|
| **Eventual availability** | A new metric is readable after up to 2 minutes and listed after up to 15; older timestamps take longer | Poll `get_metric_data` with a deadline; never `list_metrics` for "did it arrive" |
| **The current period is not final** | A `Sum` for the minute in progress grows | Query completed periods or compare with `>=` |
| **1-minute granularity** | Several events inside a minute are one datapoint | Assert on `Sum` or `SampleCount` over a window, not on one datapoint per event |
| **Clock skew** | A runner clock ahead by more than 2 hours makes `PutMetricData` reject timestamps; alarms use UTC now | `datetime.now(timezone.utc)`, never naive local time; leave `Timestamp` out when you can |
| **Period alignment** | `StartTime` is rounded down; a window that starts mid-period can include an extra period | Align `StartTime` and `EndTime` to the period, add a minute of margin |
| **Missing is not zero** | Idle SQS queues, ECS services without tasks and quiet topics publish nothing | Treat empty series as "no data"; use `TreatMissingData` deliberately |
| **Unit and dimension filters** | A query with a unit that does not match, or with an incomplete dimension set, returns no datapoints | Query with exactly what you published |
| **Order** | `get_metric_data` is newest-first by default, `get_metric_statistics` is unordered | Sort by timestamp |
| **Forced alarm state flips back** | `describe_alarms` a few seconds later shows the real state | Assert on `describe_alarm_history` |
| **Shared quotas** | 3 alarm writes per second, 25 `ListMetrics`, 9 `DescribeAlarms` requests per second | Serialise smoke tests; one alarm writer at a time |
| **Metrics cannot be deleted** | A unique namespace per run piles up | Fixed namespace and dimensions, unique values |
| **Percentiles on few samples** | A p99 of three requests is noise | `EvaluateLowSampleCountPercentile="ignore"`; assert on counts first |
| **At-least-once delivery** | EMF extraction and subscription filters can deliver duplicates | Do not assert exact counts for EMF-derived or subscribed data |
| **Insights timing** | Queries are `Scheduled` or `Running` before `Complete`, and 10 requests per second is the rate limit | Poll with a deadline; stop timed-out queries |

For load tests, read CloudWatch **after** the run with a margin of a few minutes (ECS, SQS and Bedrock metrics are one-minute data), and keep the queue-level examples in the [SQS load-test guide](../sqs/06-moto-gaps-smoke-load-ci.md) and the general method in [Performance Testing](../../performance-testing/index.md).

## QA Checklist

- [ ] Every custom metric has a namespace owned by the application, a `Unit` and dimensions drawn from a closed set; no identifier is a dimension.
- [ ] Payload builders (metrics, EMF lines, log records, alarms, dashboards) are pure and unit-tested, including their limits.
- [ ] Every alarm definition passes Stubber validation and a compliance check: DLQ-depth alarm per redrive queue, CPU and running-task alarms per ECS service, actions set, `TreatMissingData` explicit and correct for the metric.
- [ ] Alarm actions were exercised at least once end to end (SNS topic policy, subscription, delivery).
- [ ] Every log group has retention; log lines are JSON with stable field names and a request ID.
- [ ] Insights queries and metric filter patterns used in alarms or dashboards are kept as reviewed constants and run once against real data.
- [ ] No test sleeps for CloudWatch; every wait has a deadline and reads completed periods.
- [ ] The smoke job runs in a dedicated account with an OIDC role limited to one namespace and tagged alarms, and cleans up in `finally`.
- [ ] The moto-gap tests are green, so an upgrade that changes emulation is noticed.

## Quick Rules

1. **Treat moto as a metric and log store,** not as CloudWatch's evaluator.
2. **Pin every known gap with a test** so upgrades are visible.
3. **Smoke test two things:** data arrives, a forced alarm state is recorded; nothing else needs a real account.
4. **Read with deadlines and margins;** query completed periods.
5. **Use a unique value, not a unique metric.**
6. **Assert on history, not on a forced state.**
7. **Limit the test role by namespace and alarm name prefix,** and check the account ID before writing.
8. **Run unit tests on every pull request and the smoke job on a schedule,** with OIDC and no stored keys.

---
## See also
- [Amazon CloudWatch — Overview](./index.md)
- [Amazon CloudWatch — Testing CloudWatch-Based Systems](./05-testing.md)
- [Amazon CloudWatch — Alarms & Dashboards](./03-alarms-dashboards.md)
- [AWS Foundations — Credentials, IAM & Local Testing](../foundations/02-credentials-iam-local-testing.md)
- [Amazon SQS — moto Gaps, Smoke Tests, Load & CI](../sqs/06-moto-gaps-smoke-load-ci.md)
- [Amazon SNS — Topics, Subscriptions & Fan-out](../sns/index.md)
- [Performance Testing](../../performance-testing/index.md)
- [Pytest — Python Testing Framework](../../libs/pytest/index.md)
