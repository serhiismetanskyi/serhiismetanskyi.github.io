---
date: 2026-09-25
tags:
  - api
  - architecture
  - rest
  - api-testing
---

# REST: The HTTP QUERY Method (RFC 10008)

**QUERY** is a new HTTP method for **safe, idempotent requests with a body**. It was published as
[RFC 10008](https://www.rfc-editor.org/info/rfc10008) (Proposed Standard) in **June 2026** by the IETF HTTP working group.

> "The QUERY method is used to ask the target resource to perform a query operation within the scope of that
> target resource. The content of the request and its media type define the query." — RFC 10008, §2

It fills the gap between two methods teams have been bending for years:

| Need | GET + query string | GET with a body | POST | **QUERY** |
|---|---|---|---|---|
| Complex query in the request | Encoded into the URL | Body has "no defined semantics" (RFC 9110) | Yes | **Yes** |
| Safe (no side effects) | Yes | Yes | No — clients can't tell | **Yes** |
| Idempotent (auto-retry) | Yes | Yes | No | **Yes** |
| Cacheable | Yes | Unreliable | Only for later GET/HEAD | **Yes, keyed on the body** |
| URL length limits | Yes — unknown along the chain | — | No | **No** |
| Query leaks into logs / bookmarks | Yes | No | No | **No** |
| Works through proxies and libraries | Yes | Often dropped or rejected | Yes | **Support still rolling out** |

## Status

| | |
|---|---|
| Specification | RFC 10008 "The HTTP QUERY Method", Standards Track, June 2026 |
| Authors | J. Reschke, J.M. Snell, M. Bishop (IETF HTTPBIS) |
| History | Started as the `SEARCH` method (2015), became `draft-ietf-httpbis-safe-method-w-body` (2021–2025) |
| IANA registry | `QUERY` — Safe: **yes**, Idempotent: **yes** |
| New header | `Accept-Query` (response) — Structured Field List |

## Semantics

### Request

- The **body defines the query**; its media type is **mandatory**.
  "Servers MUST fail the request if the Content-Type request field … is missing or is inconsistent with the request content."
- **Safe** — the client doesn't request any change to the target resource.
  The server may still create *additional* resources, e.g. a stored query.
- **Idempotent** — can be retried after a connection failure.
- The URI query part still identifies the resource; how it combines with the body is up to the resource.

```http
QUERY /contacts HTTP/1.1
Host: example.org
Content-Type: application/x-www-form-urlencoded
Accept: application/json

select=surname,givenname,email&limit=10&match=%22email=*@example.*%22
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

[{"surname": "Smith", "givenname": "John", "email": "smith@example.org"}]
```

The RFC's examples use form-encoded data, `application/jsonpath`, `application/sql` and `application/xslt+xml`;
a JSON filter document works the same way.

### Status Codes

| Situation | Status |
|---|---|
| Query processed, results in the body | **200** |
| `Content-Type` missing | **400** |
| Body doesn't match the declared media type (no sniffing) | **400** |
| Media type not supported for QUERY on this resource | **415** + `Accept-Query` / `Accept` listing supported types |
| Valid syntax but can't be processed (e.g. SQL on a non-existent table) | **422** |
| Requested response format not available | **406** |
| Resource doesn't support QUERY | **405** + `Allow` |
| Results available elsewhere | **303** + `Location` → client sends **GET** |

### Accept-Query: Discovering Support

A response header that says "this resource accepts QUERY with these formats":

```http
HEAD /contacts HTTP/1.1
Host: example.org
```

```http
HTTP/1.1 200 OK
Content-Type: application/xhtml
Accept-Query: application/x-www-form-urlencoded, application/sql
```

- It is an RFC 9651 **Structured Field List** of tokens or strings — `"application/json"` and `application/json` mean the same.
- Only `*/*` and `type/*` wildcards; order doesn't matter.
- Applies to every URI with the same path (the query component is ignored).

### Location and Content-Location

| Header on a 2xx | Meaning | Client can |
|---|---|---|
| `Content-Location` | URI of **the result** of this query (may be temporary) | `GET` it to fetch the same result again |
| `Location` | URI of the **equivalent resource** — the query itself | `GET` it to re-run the query without resending the body |

Indirect response — the server stores the query and redirects:

```http
HTTP/1.1 303 See Other
Content-Type: text/plain
Location: /contacts/stored-queries/42

See stored query at "/contacts/stored-queries/42".
```

### Redirects

| Status | Client must |
|---|---|
| 301, 302, 307, 308 | Send the **same QUERY with the body** to the new URI. The old "POST becomes GET after 301/302" exception does **not** apply |
| 303 | Send a **GET** to the new URI |

### Caching

- QUERY responses are **cacheable**.
- "The cache key for a QUERY request **MUST** incorporate the request content … and related metadata."
- Caches may normalise insignificant differences (content encoding, JSON formatting per the media type) — only to build the key.
- A `Location` in the response lets clients switch to plain GET, which every cache already handles.

### CORS and Security

- **Not a CORS-safelisted method** → cross-origin QUERY from a browser always needs a **preflight**;
  the server must list `QUERY` in `Access-Control-Allow-Methods`.
- Prefer QUERY over GET for **sensitive filters**: URIs end up in logs, history and referrers far more often than bodies.
- A temporary result URI **should not embed** sensitive request content.
- Wrong cache normalisation can produce **false-positive hits** — one user's query answered with another's result.

## Ecosystem Support (September 2026)

Python — checked by running each library:

| Library | Client / server | How | Notes |
|---|---|---|---|
| **httpx** 0.28 | Client | `client.request("QUERY", url, json=...)` | No `.query()` helper. 302 is turned into GET (the RFC says keep QUERY) |
| **requests** 2.34 | Client | `requests.request("QUERY", url, json=...)` | 301 keeps QUERY but **drops the body**; 302 → GET |
| **urllib3** 2.8 | Client | `urllib3.request("QUERY", url, ...)` | QUERY is **not** in `Retry.DEFAULT_ALLOWED_METHODS` — not retried by default |
| **aiohttp** 3.14 | Client | `session.request("QUERY", url, ...)` | Works |
| **FastAPI** 0.141 | Server | `@app.api_route(path, methods=["QUERY"])` | No `@app.query` decorator yet |
| **Starlette** 1.7 | Server | `HTTPEndpoint.query()`, CORS middleware knows QUERY | Native support since 1.7 (Sep 2026) |
| **Flask** 3.1 | Server | `@app.route(path, methods=["QUERY"])` | Works, `request.get_json()` included |
| **Django** | Server | Add `"query"` to `View.http_method_names` | Class-based views return 405 otherwise |

Elsewhere:

- **curl** — `curl -X QUERY --data …` works (any method is passed through). With `-L` it doesn't follow the RFC's redirect rules.
- **Node.js** — the HTTP parser supports QUERY since Node 22 (and 20.19.2 LTS); `undici` added QUERY in v8.6.
- **Go** — `http.MethodQuery` is on master, expected in Go 1.28.
- **Browsers** — `fetch()` allows QUERY with a body, but the method is **not case-normalised** (write `"QUERY"` in uppercase), and browsers don't cache it yet (discussed in whatwg/fetch#1938).
- **Proxies, gateways, CDNs** — support is uneven: some pass QUERY through, others reject unknown methods
  (e.g. nginx `limit_except` returns 403). **Test the whole path.**
- **OpenAPI 3.2** adds a `query` operation to Path Items.

## Server: FastAPI

```python
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

app = FastAPI()

SUPPORTED = "application/json"
ACCEPT_QUERY = {"Accept-Query": f'"{SUPPORTED}"'}

CONTACTS = [
    {"id": 1, "name": "John Smith", "email": "smith@example.org", "status": "active"},
    {"id": 2, "name": "Ann Lee", "email": "lee@example.com", "status": "blocked"},
]

@app.api_route("/contacts", methods=["QUERY"])
async def query_contacts(request: Request) -> Response:
    content_type = request.headers.get("content-type", "").split(";")[0].strip()
    if not content_type:
        return JSONResponse({"error": "Content-Type is required"}, status_code=400)
    if content_type != SUPPORTED:
        return Response(status_code=415, headers=ACCEPT_QUERY)

    try:
        query = await request.json()
    except ValueError:
        return JSONResponse({"error": "Body is not valid JSON"}, status_code=400)
    if not isinstance(query, dict) or set(query) - {"status", "limit"}:
        return JSONResponse({"error": "Unsupported query fields"}, status_code=422)

    rows = [c for c in CONTACTS if "status" not in query or c["status"] == query["status"]]
    return JSONResponse(rows[: query.get("limit", 100)], headers=ACCEPT_QUERY)

@app.head("/contacts")
async def contacts_capabilities() -> Response:
    """Lets clients discover QUERY support via Accept-Query."""
    return Response(headers=ACCEPT_QUERY)
```

Class-based alternative with Starlette 1.7+:

```python
from starlette.endpoints import HTTPEndpoint
from starlette.responses import JSONResponse

class ContactSearch(HTTPEndpoint):
    async def query(self, request):
        return JSONResponse({"received": await request.json()})
```

## Client: httpx

```python
import httpx

with httpx.Client(base_url="https://api.example.org") as client:
    response = client.request("QUERY", "/contacts", json={"status": "active", "limit": 10})
    response.raise_for_status()
    print(response.json())
    print("Supported query formats:", response.headers.get("accept-query"))
```

Command line:

```bash
curl -i -X QUERY https://api.example.org/contacts \
  -H 'Content-Type: application/json' \
  --data '{"status": "active", "limit": 10}'
```

## Testing QUERY Endpoints

What to check, mapped to the RFC:

| Area | Check |
|---|---|
| **Safety** | Repeating QUERY doesn't change data, audit logs or ETags |
| **Idempotency** | Retry after a dropped connection returns the same result; check your client actually retries |
| **Content-Type** | Missing → 400, unsupported → 415 with `Accept-Query`, mismatched body → 400, unprocessable → 422, bad `Accept` → 406 |
| **Discovery** | `Accept-Query` parses as a Structured Field List; `OPTIONS` lists QUERY in `Allow`; unsupported resource → 405 |
| **Caching** | Different bodies to the same URL never share a cached response; identical bodies may hit the cache |
| **Location / 303** | GET the returned URIs; after 303 the client switches to GET; after 301/302/307/308 it resends QUERY **with the body** |
| **Conditional requests** | `If-None-Match` / `If-Modified-Since` → 304 |
| **Infrastructure** | Through WAF, proxies, API gateway and CDN: no 403/405/501, body not stripped, method not rewritten |
| **Browsers / CORS** | Preflight happens; `Access-Control-Allow-Methods` includes QUERY |
| **Privacy** | Sensitive filters don't leak into `Location` / `Content-Location` URIs or access logs |

pytest tests for the FastAPI example above:

```python
import pytest
from fastapi.testclient import TestClient

from app import CONTACTS, app

client = TestClient(app)

def query(body=None, **kwargs):
    return client.request("QUERY", "/contacts", json=body, **kwargs)

def test_query_returns_filtered_results():
    response = query({"status": "active"})
    assert response.status_code == 200
    assert [c["id"] for c in response.json()] == [1]
    assert response.headers["accept-query"] == '"application/json"'

def test_query_is_safe():
    before = [dict(c) for c in CONTACTS]
    for _ in range(3):
        query({"status": "blocked"})
    assert CONTACTS == before

def test_different_bodies_give_different_results():
    active = query({"status": "active"}).json()
    blocked = query({"status": "blocked"}).json()
    assert active != blocked

def test_missing_content_type_is_rejected():
    response = client.request("QUERY", "/contacts", content=b'{"status": "active"}')
    assert response.status_code == 400

@pytest.mark.parametrize("content_type", ["application/sql", "text/plain"])
def test_unsupported_media_type_lists_accepted_formats(content_type):
    response = client.request(
        "QUERY", "/contacts", content=b"select 1", headers={"Content-Type": content_type}
    )
    assert response.status_code == 415
    assert "application/json" in response.headers["accept-query"]

def test_unprocessable_query_returns_422():
    assert query({"unknown_field": 1}).status_code == 422

def test_get_is_not_allowed_on_query_resource():
    response = client.get("/contacts")
    assert response.status_code == 405
```

## When to Use QUERY

- **Use it** for search and filter endpoints with complex or long criteria, query languages (JSONPath, SQL-like,
  GraphQL-like documents) and sensitive filters that shouldn't appear in URLs.
- **Keep GET** for simple, shareable, bookmarkable lookups — they work everywhere today.
- **Keep POST** for operations that change state.
- **Before switching**, verify every hop (clients, gateways, WAF, CDN, monitoring) supports QUERY; provide a GET or
  POST fallback while support is rolling out.

---
## See also
- [REST: Architecture and HTTP Layer](01-architecture-http.md)
- [REST: Querying Layer](03-querying.md)
- [REST: Caching, Concurrency and Idempotency](04-caching-concurrency.md)
- [REST: Testing Plan and Risks](06-testing-risks.md)
