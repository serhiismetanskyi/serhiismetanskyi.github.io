---
date: 2026-10-21 12:00:00
tags:
  - aws
  - boto3
  - python
  - error-handling
---

# AWS Foundations — Clients, Config, Retries & Errors

How to create boto3 clients that behave well in production and in tests: sessions, `Config`, timeouts, retry modes, endpoint overrides, pagination and error handling.

## Install

```bash
uv add boto3                       # also installs botocore
uv add --dev "moto[sqs,sns,server]" pytest     # tests: pick the service extras you need
```

## Session, Client, Resource

```python
import boto3

session = boto3.Session(region_name="eu-west-1")     # holds credentials + region + profile
sqs = session.client("sqs")                           # low-level client: one method per API operation
sqs_default = boto3.client("sqs", region_name="eu-west-1")   # uses the default session
```

| Object | Use |
|--------|-----|
| `boto3.client(service)` | Low-level, 1:1 with the API. Always up to date. **Use this.** |
| `boto3.resource(service)` | Object-style wrapper (`Queue`, `Topic`). **Feature freeze:** the AWS SDK team does not add features to resources, new capabilities appear on clients only. Existing code keeps working |
| `boto3.Session` | Choose a profile or credentials explicitly, build several clients with the same settings |
| `session.client(...)` in threads | Create one **session per thread**; a single client can be shared across threads |

The default session is shared and created lazily. In tests prefer `boto3.Session(...)` objects or environment variables set by a fixture, not mutation of the default session.

## `botocore.config.Config`

```python
import boto3
from botocore.config import Config

cfg = Config(
    region_name="eu-west-1",
    connect_timeout=3,                       # seconds to open the connection
    read_timeout=10,                         # seconds to wait for the response
    retries={"mode": "standard", "total_max_attempts": 4},
    max_pool_connections=20,                 # default 10; raise it for thread pools
    user_agent_extra="orders-service/1.4",   # appended to the User-Agent header
)
sqs = boto3.client("sqs", config=cfg)
print(sqs.meta.region_name, sqs.meta.config.retries)
# eu-west-1 {'mode': 'standard', 'total_max_attempts': 4}
```

| Setting | Notes |
|---------|-------|
| `connect_timeout`, `read_timeout` | Set both. A hung connection otherwise blocks a worker for a long time. Generative calls (Bedrock) need a much larger `read_timeout` than queue calls |
| `retries` | See the next section |
| `max_pool_connections` | One connection per concurrent request; a thread pool larger than the pool logs "Connection pool is full" and discards connections |
| `signature_version` | Leave the default (SigV4) unless an emulator needs unsigned requests (`botocore.UNSIGNED`) |
| `tcp_keepalive`, `proxies` | For long-lived idle connections and corporate proxies |

## Retries

botocore retries **throttling, transient network errors and 5xx** responses before your code sees an exception.

| Mode | Default attempts (including the first call) | Behaviour |
|------|--------------------------------------------|-----------|
| `legacy` (**the default**) | 5 | Older rules, exponential backoff, a shorter list of retryable errors |
| `standard` | 3 | Wider list (`RequestThrottled`, `SlowDown`, `ThrottlingException`, `TooManyRequestsException`, 500/502/503/504 ...), backoff capped at 20 s, circuit-breaking on outages |
| `adaptive` | not stated; builds on `standard` | `standard` plus a client-side token bucket that slows requests when the service throttles. Documented as experimental |

`max_attempts` means different things in different places, which is a classic source of off-by-one bugs:

```python
Config(retries={"max_attempts": 5})          # in Config: retries only, so the first call + 5 = 6 total
Config(retries={"total_max_attempts": 6})    # always counts the first call: prefer this
# AWS_MAX_ATTEMPTS=6 and `max_attempts = 6` in ~/.aws/config count the first call
```

`Config(retries={"mode": "standard", "max_attempts": 5})` resolves to `{'mode': 'standard', 'total_max_attempts': 6}`, and `AWS_RETRY_MODE=adaptive AWS_MAX_ATTEMPTS=7` resolves to `{'total_max_attempts': 7, 'mode': 'adaptive'}`.

The retry list is fixed by botocore, not by the service: in the SNS guide a fake server returning SNS's `Throttled` error (HTTP 429) was **not retried** in `standard` or `adaptive` mode (one call), while `legacy` made five. Do not assume a throttling error is retried for you; add an application-level retry for the codes you care about (see the [SNS guide](../sns/02-boto3-python.md)).

**Retries are not idempotency.** botocore resends the same request after a timeout, so an operation that *might* have succeeded runs twice: `SendMessage` to a standard SQS queue then delivers a duplicate. Design consumers to tolerate duplicates (see [SQS consumer patterns](../sqs/03-consumer-patterns.md)).

## Endpoints: Real AWS, Emulators and Tests

```python
sqs = boto3.client("sqs", region_name="us-east-1", endpoint_url="http://localhost:5000")
```

Without code changes, set an environment variable (botocore 1.28+):

| Variable | Effect |
|----------|--------|
| `AWS_ENDPOINT_URL=http://localhost:5000` | Every service client goes to this URL |
| `AWS_ENDPOINT_URL_SQS=http://localhost:9324` | Only SQS clients; wins over `AWS_ENDPOINT_URL` (the service id is upper-cased, `_` for spaces) |

With both set, an SQS client uses `http://localhost:9324` and an SNS client uses `http://localhost:5000`. This makes the same application code run against real AWS in production and against a local emulator in tests.

## Pagination

List operations return a page and a token. Use paginators instead of hand-written loops.

```python
paginator = sqs.get_paginator("list_queues")
for page in paginator.paginate(QueueNamePrefix="orders-", PaginationConfig={"PageSize": 100}):
    for url in page.get("QueueUrls", []):           # the key is absent when a page is empty
        print(url)

print(sqs.can_paginate("list_queues"))              # True
```

With five queues and `PageSize=2` the paginator produced pages of `[2, 2, 1]`. Not every list call has a paginator (`can_paginate`); for those, loop on `NextToken` yourself.

## Errors

```python
from botocore.exceptions import BotoCoreError, ClientError

try:
    sqs.get_queue_url(QueueName="nope")
except sqs.exceptions.QueueDoesNotExist as e:           # modeled exception: precise and readable
    print("missing:", e.response["Error"]["Message"])
except ClientError as e:                                # any error returned by the service
    code = e.response["Error"]["Code"]
    status = e.response["ResponseMetadata"]["HTTPStatusCode"]
    request_id = e.response["ResponseMetadata"]["RequestId"]   # put it in logs and support tickets
    raise
except BotoCoreError:                                   # client side: no credentials, bad endpoint, timeouts
    raise
```

| Exception | Meaning | Typical handling |
|-----------|---------|------------------|
| `ClientError` | The service answered with an error. `e.response["Error"]["Code"]` is the stable key | Branch on the code. 4xx is usually your bug or permissions; 5xx and throttles are retried by botocore first |
| `client.exceptions.<Name>` | Subclass of `ClientError` for errors modeled by the service | Prefer it for expected cases |
| `NoCredentialsError` | The provider chain found nothing | Fix configuration, do not retry |
| `EndpointConnectionError` | Could not connect (wrong endpoint, no network) | Retry or fail fast; in tests it means the emulator is not running |
| `ReadTimeoutError`, `ConnectTimeoutError` | Your `Config` timeouts fired | Retryable if the operation is idempotent |
| `ParamValidationError` | botocore rejected the arguments **before** sending | A bug in your call; Stubber and moto both raise it |

Common cross-service codes:

| Code | Cause |
|------|-------|
| `AccessDenied` / `AccessDeniedException` / `AuthorizationError` | IAM policy, resource policy or an SCP denies the action. The message often names the missing action |
| `ThrottlingException`, `RequestThrottled`, `TooManyRequestsException` | You exceeded a quota; botocore already retried. Back off and reduce concurrency |
| `ValidationException` / `InvalidParameterValue` | Bad request values, not retryable |
| `ResourceNotFoundException`, `NotFound`, service-specific "does not exist" | Wrong region, account or name |
| `ExpiredToken`, `InvalidClientTokenId`, `SignatureDoesNotMatch` | Expired temporary credentials, wrong key or a clock skew |

On moto, a missing queue raises `sqs.exceptions.QueueDoesNotExist` with the error body `{'Code': 'AWS.SimpleQueueService.NonExistentQueue', 'QueryErrorCode': 'QueueDoesNotExist', ...}` and HTTP 400. The `Code` string differs between protocol generations and emulators, so **catch the modeled exception class** rather than comparing a code string you copied from an old tutorial.

## Reading the Service Model

The API surface is data you can inspect, which is handy for checking a parameter name before using it:

```python
sqs = boto3.client("sqs", region_name="us-east-1")
model = sqs.meta.service_model
print(model.protocol, len(model.operation_names))        # json 23
print(list(model.operation_model("SendMessage").input_shape.members))
# ['QueueUrl', 'MessageBody', 'DelaySeconds', 'MessageAttributes',
#  'MessageSystemAttributes', 'MessageDeduplicationId', 'MessageGroupId']
```

## Quick Rules

1. Use **clients**; set `region_name`, both timeouts and `retries={"mode": "standard", "total_max_attempts": N}` in one shared `Config`.
2. Read `total_max_attempts`, not `max_attempts`, to avoid the off-by-one between `Config` and the environment variable.
3. Treat every retried call as possibly executed twice.
4. Use **paginators**; never assume a list call returns everything.
5. Catch **modeled exceptions** and `ClientError`; log `RequestId`.
6. Control endpoints with `AWS_ENDPOINT_URL[_SERVICE]` so code is identical in tests and production.

---
## See also
- [AWS Foundations](./index.md)
- [02 Credentials, IAM & Local Testing](./02-credentials-iam-local-testing.md)
- [Resilience: retries and timeouts](../../libs/resilience/index.md)
- [Amazon SQS](../sqs/index.md)
