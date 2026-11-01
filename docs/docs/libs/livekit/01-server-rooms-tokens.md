---
date: 2026-10-24 12:00:00
tags:
  - python
  - libraries
  - livekit
  - webrtc
  - jwt
---

# LiveKit — Server, Rooms & Tokens

The open-source **LiveKit server** is a single Go binary (`livekit-server`, Apache-2.0) that terminates WebRTC, forwards media between participants (an **SFU**: Selective Forwarding Unit, no mixing or transcoding), and exposes a signalling WebSocket plus a Twirp HTTP API. This page covers the concepts, running and configuring the server, the `lk` CLI, access tokens, the server APIs and webhooks.

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Room** | A named session. Created by `CreateRoom`, or automatically when the first participant joins (`room.auto_create`, default on). Closes after `empty_timeout` (default 300 s) with nobody in it, or `departure_timeout` (default 20 s) after the last participant leaves |
| **Participant** | Anything joined to a room: `STANDARD` user, `AGENT`, `SIP` caller, `INGRESS`, `EGRESS`, `CONNECTOR`. Has `identity` (unique, from the token `sub`), optional `name`, `metadata` (string) and `attributes` (string map) |
| **Track** | A media stream (audio, video). Sources: `camera`, `microphone`, `screen_share`, `screen_share_audio` |
| **Publication** | A participant's published track as seen by others; subscribers choose what to receive |
| **SFU** | The server forwards each publisher's packets to subscribers. CPU and bandwidth scale with subscribers, not with mixing |
| **Simulcast** | A publisher sends several video resolutions; the server forwards the layer that fits each subscriber. On by default in every SDK. **Dynacast** (`dynacast: true` in room options) pauses layers nobody consumes |
| **Audio** | Opus; RED (redundant packets) recovers from packet loss and is recommended on |
| **Data** | Text streams (topics such as `lk.chat`), byte streams, **RPC**, participant `attributes`, room `metadata`, raw data packets (reliable or lossy), data tracks |
| **Node** | One `livekit-server` process. Several nodes need Redis |

Choose the data channel by use: chat or LLM output → text streams; files → byte streams; call a method on another participant → RPC; shared state → attributes or room metadata.

## Running the Server

### Development mode

```bash
livekit-server --dev                     # API key devkey, secret "secret", debug logs
livekit-server --dev --bind 0.0.0.0      # reachable from other devices (default bind is 127.0.0.1)

docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server --dev --bind 0.0.0.0
```

`--dev` turns on debug logging, console log format and `/debug/pprof`, and uses the placeholder key pair `devkey` / `secret`. In dev mode media UDP uses the single port `7882`. Never expose a dev-mode server.

Install the binary with `brew install livekit` or `curl -sSL https://get.livekit.io | bash`; the Docker image is `livekit/livekit-server`.

### Command line

| Flag / command | Env | Purpose |
|----------------|-----|---------|
| `--config FILE` | | Config file path |
| `--config-body YAML` | `LIVEKIT_CONFIG` | Config as a string (containers) |
| `--keys "key: secret"`, `--key-file FILE` | `LIVEKIT_KEYS` | API key/secret pairs |
| `--bind ADDR` (repeatable) | | Listen address |
| `--node-ip IP` | `NODE_IP` | IP advertised to clients (auto-detected) |
| `--udp-port N` | `UDP_PORT` | UDP port(s) for WebRTC |
| `--redis-host HOST:PORT`, `--redis-password` | `REDIS_HOST`, `REDIS_PASSWORD` | Redis |
| `--turn-cert`, `--turn-key` | `LIVEKIT_TURN_CERT`, `LIVEKIT_TURN_KEY` | TLS files for TURN |
| `--region NAME` | `LIVEKIT_REGION` | Region of this node |
| `generate-keys` | | Print a new API key and secret |
| `ports` | | Print the ports the current config uses |
| `list-nodes` | | List nodes (multi-node) |

### Production config

```yaml
# livekit.yaml
port: 7880                     # HTTP and WebSocket signalling (put TLS in front)
log_level: info
rtc:
  tcp_port: 7881               # ICE/TCP fallback
  port_range_start: 50000      # UDP range for media
  port_range_end: 60000
  use_external_ip: true        # discover the public IP through STUN
redis:
  address: redis.internal:6379 # needed for more than one node, and for SIP / egress / ingress
prometheus:
  port: 6789                   # /metrics
room:
  empty_timeout: 300
  departure_timeout: 20
  max_participants: 0          # 0 = unlimited
webhook:
  api_key: APIexample          # must be one of the keys below
  urls:
    - https://backend.example.com/livekit-webhook
turn:
  enabled: true
  domain: turn.example.com     # must match the TLS certificate
  tls_port: 5349               # 443 when there is no load balancer
  udp_port: 3478
  external_tls: true           # TLS ends at a layer 4 load balancer; otherwise set cert_file and key_file
keys: {}                       # supply with LIVEKIT_KEYS="APIexample: <secret>" instead of the file
```

Pass it with `--config livekit.yaml` or `LIVEKIT_CONFIG="$(cat livekit.yaml)"`. `config-sample.yaml` in the repository lists every key. Generate keys with `livekit-server generate-keys`; secrets should be long random strings (32+ characters).

### Ports

| Port | Proto | Config key | Purpose |
|------|-------|------------|---------|
| 7880 | TCP | `port` | API and WebSocket signalling; terminate TLS in front of it |
| 7881 | TCP | `rtc.tcp_port` | ICE/TCP fallback for clients that cannot use UDP |
| 50000-60000 | UDP | `rtc.port_range_start` / `_end` | WebRTC media, about two ports per participant |
| 7882 | UDP | `rtc.udp_port` | Optional single-port UDP mux; when set the range is unused |
| 5349 | TLS | `turn.tls_port` | Optional embedded TURN/TLS |
| 3478 | UDP | `turn.udp_port` | Optional embedded TURN/UDP and STUN |
| 6789 | TCP | `prometheus.port` | Metrics |

`livekit-server ports` prints the list for a given config. Docker: use host networking in production for performance (`network_mode: host`); with port mappings, map the whole UDP range or use the single UDP port. TURN is embedded and authenticated through the signalling connection. With `tls_port` set, the server refuses to start unless it has `cert_file` and `key_file` (TLS terminated by LiveKit) or `external_tls: true` (a layer 4 load balancer terminates TLS).

### Multi-node

Set `redis.address` on every node and put a load balancer in front of port 7880. Rooms are assigned to nodes; `node_selector` in the config chooses by `any`, `cpuload`, `sysload` or `regionaware`. Agent workers, SIP, egress and ingress services use the same Redis. Kubernetes and Compose layouts are in [04](./04-telephony-egress-production.md).

### Metrics

With `prometheus.port` set, `/metrics` includes `livekit_room_total`, `livekit_participant_total`, `livekit_node_packet_total`, `livekit_webhook_queue_length`, `livekit_quality_score` and Go runtime metrics.

## The `lk` CLI

```bash
lk --dev room create demo                                   # --dev: devkey/secret against localhost:7880
lk --dev room list
lk --dev token create --room demo --identity alice --join --valid-for 1h --token-only
lk --dev room join --publish-demo --identity bot demo       # simulated publisher
lk --dev dispatch create --agent-name my-agent --room demo --metadata '{"user_id":"12345"}'
lk --dev perf load-test --room lt --audio-publishers 2 --subscribers 2 --duration 30s
```

| Group | Commands |
|-------|----------|
| Rooms and media | `room` (`create`, `list`, `update`, `delete`, `join`, `participants`, `mute-track`, `update-subscriptions`, `send-data`), `token create`, `dispatch`, `egress`, `ingress` |
| Telephony | `sip inbound`, `sip outbound`, `sip dispatch`, `sip participant` |
| Agents (local) | `agent dev`, `agent start`, `agent console`, `agent debugger` |
| Performance | `perf load-test`, `perf agent-load-test` |

Global flags: `--url` (`LIVEKIT_URL`, default `http://localhost:7880`), `--api-key`, `--api-secret`, `--dev` (use `devkey`/`secret`), `--curl` (print the equivalent curl command), `--yes` for CI. Use `lk token create --help` for the grant flags (`--join`, `--admin`, `--create`, `--list`, `--allow-source`, `--grant JSON`, `--agent`, `--job-metadata`).

## Access Tokens

A client connects with a **JWT signed with the API secret** (HS256). The claims carry the participant's identity, the room and the permissions. These are ordinary JWTs, so the format, claim validation and key rules in [PyJWT](../pyjwt/index.md) apply; LiveKit's `TokenVerifier` is a thin wrapper over `jwt.decode`.

| Claim | Meaning |
|-------|---------|
| `iss` | API key that signed the token |
| `sub` | Participant identity |
| `nbf`, `exp` | Valid-from and expiry. `exp` applies to the first connection only; reconnects keep working |
| `name`, `metadata`, `attributes` | Participant display name, string metadata, string-map attributes |
| `video` | The video grant (below) |
| `sip` | SIP grant: `admin` (manage trunks and rules), `call` (create SIP participants) |
| `roomConfig` | `RoomConfiguration` applied only when the room is created: for example `agents` to dispatch |

| `video` grant | Meaning |
|---------------|---------|
| `roomJoin` + `room` | Join that room (both required) |
| `roomCreate`, `roomList` | Create/delete rooms, list rooms |
| `roomAdmin` | Moderate a room (list participants, remove, mute, update) |
| `roomRecord`, `ingressAdmin` | Use egress, use ingress |
| `canPublish`, `canSubscribe`, `canPublishData` | Publish tracks, subscribe, send data (all default to true in the Python SDK) |
| `canPublishSources` | Allowed sources (`camera`, `microphone`, ...); requires `canPublish` |
| `canUpdateOwnMetadata` | Participant may change its own name and metadata |
| `hidden` | Invisible to other participants (monitoring bots) |

```python
import datetime

from livekit import api


def join_token(identity: str, room: str, *, agent: str | None = None, speak: bool = True) -> str:
    token = (
        api.AccessToken("devkey", "secret-at-least-32-characters-long")   # API_KEY / API_SECRET from the environment in real code
        .with_identity(identity)
        .with_name(identity.title())
        .with_ttl(datetime.timedelta(minutes=15))        # default is 6 hours
        .with_attributes({"plan": "free"})
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=speak,
                can_publish_sources=["microphone"] if speak else None,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
    )
    if agent:
        token = token.with_room_config(api.RoomConfiguration(agents=[api.RoomAgentDispatch(agent_name=agent)]))
    return token.to_jwt()
```

`TokenVerifier(api_key, api_secret).verify(token)` returns `Claims` (raises `jwt.InvalidTokenError` subclasses on bad signature, issuer or expiry; it requires `exp`).

Rules for tokens:

- Mint them **on your backend** after authenticating the user ([FastAPI](../fastapi/index.md) endpoint, for example); never ship the API secret to a client.
- Use **short TTLs** (minutes). On a self-hosted server, removing a participant or changing permissions does **not** invalidate tokens already issued; stop issuing new ones and keep the TTL short.
- Use **opaque identities and room names** (UUIDs): they are logged and not redacted.
- Change permissions after joining with the `UpdateParticipant` API (for example issue `can_publish=False` and enable it later).
- Dispatch entries in `roomConfig` are applied only when the room is created; for an existing room use the dispatch API ([02](./02-agents-framework.md#dispatch)).

## Server APIs

The server exposes Twirp services (`/twirp/livekit.RoomService/<Method>`, POST JSON, `Authorization: Bearer <token>`). The SDKs add the header for you; the token's grants decide what is allowed.

| Service | Methods (Python client) | Needs |
|---------|-------------------------|-------|
| RoomService (`lk.room`) | `create_room`, `list_rooms`, `delete_room` | `roomCreate` / `roomList` |
| | `list_participants`, `get_participant`, `remove_participant`, `mute_published_track`, `update_participant`, `update_subscriptions`, `update_room_metadata`, `send_data` | `roomAdmin` |
| AgentDispatchService (`lk.agent_dispatch`) | `create_dispatch`, `list_dispatch`, `get_dispatch`, `delete_dispatch` | `roomAdmin` |
| SipService (`lk.sip`) | trunks, dispatch rules, `create_sip_participant` | `sip` grant |
| EgressService / IngressService | `lk.egress.*`, `lk.ingress.*` | `roomRecord` / `ingressAdmin` |

```python
import asyncio

from livekit import api


async def main() -> None:
    async with api.LiveKitAPI("http://localhost:7880", "devkey", "secret") as lk:
        await lk.room.create_room(
            api.CreateRoomRequest(name="demo", empty_timeout=60, max_participants=4, metadata='{"purpose":"support"}')
        )
        people = await lk.room.list_participants(api.ListParticipantsRequest(room="demo"))
        print([p.identity for p in people.participants])
        await lk.room.send_data(
            api.SendDataRequest(room="demo", data=b"hello", kind=api.DataPacket.Kind.RELIABLE, topic="chat")
        )
        await lk.room.delete_room(api.DeleteRoomRequest(room="demo"))


asyncio.run(main())
```

`LiveKitAPI(url, api_key, api_secret)` also reads `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` from the environment. Use `async with` (or `await lk.aclose()`) to close the HTTP session.

### Webhooks

Configure `webhook.urls` and `webhook.api_key` on the server (egress requests can add their own). The server POSTs JSON with `Content-Type: application/webhook+json` and an `Authorization` header that is a signed JWT containing the SHA-256 of the body. Delivery is not guaranteed (several retries, events queued in order), so handlers must be idempotent.

| Events | |
|--------|---|
| Room | `room_started`, `room_finished` |
| Participant | `participant_joined`, `participant_left`, `participant_connection_aborted` |
| Track | `track_published`, `track_unpublished` |
| Egress, ingress | `egress_started`, `egress_updated`, `egress_ended`, `ingress_started`, `ingress_ended` |

```python
from aiohttp import web
from livekit import api

receiver = api.WebhookReceiver(api.TokenVerifier("APIexample", "secret-at-least-32-characters-long"))


async def hook(request: web.Request) -> web.Response:
    body = (await request.read()).decode()                 # raw body: the hash is over the exact bytes
    try:
        event = receiver.receive(body, request.headers.get("Authorization", ""))
    except Exception:                                      # bad signature, hash mismatch, expired token
        return web.Response(status=401)
    print(event.event, event.room.name, event.participant.identity)
    return web.Response(status=200)


app = web.Application()
app.add_routes([web.post("/livekit-webhook", hook)])
```

Accept the `application/webhook+json` content type, pass the raw body to `receive`, and reject anything that fails verification.

## Joining from Python

The `livekit` package is the realtime SDK: bots, test participants and load generators.

```python
import asyncio

from livekit import rtc


async def main(url: str, token: str) -> None:
    room = rtc.Room()

    @room.on("data_received")
    def on_data(pkt: rtc.DataPacket) -> None:
        print(pkt.participant.identity if pkt.participant else "server", pkt.topic, pkt.data)

    await room.connect(url, token)
    await room.local_participant.publish_data(b"ping", topic="chat", reliable=True)
    await room.local_participant.set_attributes({"role": "tester"})
    await asyncio.sleep(2)
    await room.disconnect()
```

Text streams use `await room.local_participant.send_text("hello", topic="lk.chat")` to send and `room.register_text_stream_handler(topic, handler)` to receive; see [03](./03-tools-handoffs-workflows.md#text-and-data-messaging).

## Client SDKs

| Platform | Package |
|----------|---------|
| JavaScript / TypeScript | `livekit-client` (plus React components) |
| Swift, Android (and Compose), Flutter, React Native, Expo, Unity, C++ | One SDK per platform with the same room, track and data model |
| Python realtime | `livekit` |
| Server APIs | `livekit-api` (Python), `livekit-server-sdk` (Node), Go, Rust, Ruby, Kotlin |

```typescript
import { Room } from 'livekit-client';

const room = new Room();
await room.connect('wss://livekit.example.com', tokenFromYourBackend);
await room.localParticipant.enableCameraAndMicrophone();
```

## Quick Rules

1. **Dev mode is for localhost**: `--dev` uses a public key pair and opens debug endpoints.
2. **Use host networking or the full UDP range** in production, and open `7881/tcp` for fallback; add TURN for restrictive networks.
3. **Add Redis** the moment you run a second node or any of SIP, egress or ingress.
4. **Mint tokens server-side**, with the narrowest grants and a TTL of minutes.
5. **Verify webhooks** on the raw body and treat events as at-least-once.
6. **Configure `prometheus.port`** (not the deprecated `prometheus_port`) and alert on room, participant and webhook-queue metrics.
7. **Use opaque identities** and keep personal data in your own database, not in tokens, room names or participant names.

---
## See also
- [Digital Garden: Knowledge Base](../../index.md)
- [LiveKit — Open-Source WebRTC Server and Agents Framework](./index.md)
- [PyJWT — JSON Web Tokens](../pyjwt/index.md)
- [FastAPI](../fastapi/index.md)
- [Docker](../../tools/docker/index.md)
- [WebSocket](../../api-architectures/04-websocket/index.md)
