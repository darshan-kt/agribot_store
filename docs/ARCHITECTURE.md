# Architecture — Agri Robot App Store

Status: Phase 0 (design locked, implementation in later phases).
Every component below is either **built**, **scaffolded** (empty shell, compiles/runs, no behaviour) or **planned**. The state is tracked per phase in [PLAN.md](./PLAN.md).

---

## 1. System diagram

```
                                 FIELD                                    │                       CLOUD / EDGE SERVER
                                                                          │
 ┌───────────────────────────────────────────────────────────┐            │   ┌──────────────────────────────────────────────────┐
 │ ROS 2 robot (Jazzy, Humble-compatible)                    │            │   │ services/api  (FastAPI, Python 3.12)             │
 │                                                           │            │   │                                                  │
 │  Nav2 ── NavigateThroughPoses      /cmd_vel               │            │   │  ┌────────────┐  ┌──────────────┐  ┌───────────┐  │
 │  robot_localization / navsat_transform                    │            │   │  │ MQTT       │  │ Command      │  │ REST      │  │
 │  sensors: /fix /imu /scan /battery_state /diagnostics     │            │   │  │ ingest     │  │ service      │  │ OpenAPI   │  │
 │  vision node: /detections, /camera/{left,right}/…         │            │   │  │ workers    │  │ + safety     │  │ v1        │  │
 │  sprayer controller: /sprayer/command, /sprayer/state     │            │   │  └─────┬──────┘  └──────┬───────┘  └─────┬─────┘  │
 │                          ▲   │                            │            │   │        │                │                │        │
 │                          │   ▼                            │            │   │        ▼                ▼                ▼        │
 │  ┌─────────────────────────────────────────────┐          │            │   │  ┌────────────────────────────────────────────┐   │
 │  │ rclpy bridge node (robot/ros2_ws)           │          │            │   │  │ Redis 7 — pub/sub fan-out, last-value      │   │
 │  │  • ROS 2 topics  ⇄  MQTT payloads           │          │            │   │  │ cache, control leases, rate limits         │   │
 │  │  • deadman (300 ms) enforced HERE           │          │            │   │  └───────────────────┬────────────────────────┘   │
 │  │  • QoS profiles, reconnect, store-and-fwd   │          │            │   │                      ▼                           │
 │  └───────────────────┬─────────────────────────┘          │            │   │  ┌────────────────────────────────────────────┐   │
 └──────────────────────┼────────────────────────────────────┘            │   │  │ WebSocket gateway  /ws/robots/{id}         │   │
                        │                                                 │   │  │ channels: telemetry pose detections        │   │
 ┌──────────────────────┼────────────────────────────────────┐            │   │  │           sprayer mission alerts           │   │
 │ services/sim-robot   │  identical MQTT contract, no ROS 2  │            │   │  └───────────────────┬────────────────────────┘   │
 │  pose, sensors, JPEG frames, detections, sprayer physics,  │            │   │                      │                           │
 │  battery drain, mission following, deadman                 │            │   │  ┌───────────────────┴────────────────────────┐  │
 └──────────────────────┬─────────────────────────────────────┘           │   │  │ aiortc WebRTC (camera video)               │  │
                        │                                                 │   │  └───────────────────┬────────────────────────┘  │
                        ▼                                                 │   └──────────────────────┼──────────────────────────┘
        ┌───────────────────────────────┐                                 │                          │
        │ MQTT broker (Mosquitto)       │  TLS 8883, per-robot creds,     │        ┌─────────────────┴──────────────────┐
        │ agri/v1/{robot_id}/…          │  ACL per robot, LWT = offline   │        │ apps/web — Next.js App Router      │
        └───────────────────────────────┘                                 │        │  Store · Dashboard · Crop Scout ·  │
                                                                          │        │  Mission Planner · Analytics       │
                                                                          │        └────────────────────────────────────┘
                                                                          │
   ┌──────────────────────────────────────────────────────────────────────┴───────────────────────────────────────────┐
   │ PostgreSQL 16 + PostGIS + TimescaleDB  ·  Redis 7  ·  SeaweedFS (S3 API, detection & sample images)               │
   └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The sim robot is not a mock layer inside the backend. It is a separate process that connects to the same broker with its own credentials and speaks the same topics, so the backend cannot tell it apart except by the `source` field that every payload carries.

---

## 2. Data flow

### 2.1 Up (robot → browser)

| Stream             | Rate             | QoS         | Path                                              | Persistence                                  |
| ------------------ | ---------------- | ----------- | ------------------------------------------------- | -------------------------------------------- |
| `state`            | on change        | 1, retained | MQTT → ingest → Redis last-value + `robots.state` | row update                                   |
| `telemetry`        | 1–10 Hz          | 0           | MQTT → ingest → Redis pub/sub → WS                | Timescale hypertable, batched insert         |
| `sensors`          | 1 Hz             | 0           | same                                              | `sensor_readings` hypertable                 |
| `pose`             | 10 Hz            | 0           | MQTT → ingest → Redis pub/sub → WS                | sampled into `scout_runs` trajectory         |
| `detections`       | event            | 1           | MQTT → ingest → Postgres → Redis pub/sub → WS     | `detections` row + image in the object store |
| `sprayer/state`    | 2 Hz + on change | 0/1         | same                                              | `spray_events` on completed spray            |
| `mission/progress` | on change        | 1           | same                                              | `missions` row update                        |
| `config/ack`       | on change        | 1           | MQTT → ingest → Postgres                          | `robot_config_versions.acked_at`             |
| `events`           | event            | 1           | MQTT → ingest → Postgres → WS `alerts`            | `audit_log` / alert row                      |

Ingest workers are the only writers. The WebSocket gateway never touches Postgres on the hot path; it subscribes to Redis channels and forwards. Redis also holds a last-value per channel so a newly connected browser is painted immediately instead of waiting for the next tick.

### 2.2 Down (browser → robot)

```
browser  ──WS cmd──▶  gateway  ──▶  command service
                                     ├─ authn/authz (JWT, role)
                                     ├─ control lease check (one operator per robot)
                                     ├─ rate limit (Redis token bucket, per robot + per user)
                                     ├─ safety preconditions (e-stop, geofence, tank, speed, armed)
                                     ├─ audit_log write (append-only, before publish)
                                     └─ MQTT publish agri/v1/{id}/cmd/*
                                                    │
                                     robot bridge ──┴─▶ /cmd_vel | Nav2 action | /sprayer/command
```

E-stop bypasses the lease check and the rate limiter (it is idempotent and always allowed to any authenticated operator with control-capable role), and is published at QoS 1 on its own topic so it cannot queue behind telemetry.

### 2.3 Video

Two paths, negotiated at runtime, both labelled in the UI:

1. **WebRTC** (preferred): robot/sim publishes frames to an `aiortc` track; the browser negotiates over the existing WS signalling channel. Sub-250 ms glass-to-glass.
2. **JPEG over WebSocket** (fallback, always available): base64/binary frames on a dedicated `camera` channel, 320×240 at 5–10 fps, aggressively dropped under backpressure.

Detections are never carried inside the video path. They arrive on their own channel with a frame timestamp, and the frontend aligns the boxes to the most recent frame within a tolerance window; if no frame matches, the boxes render on a dimmed "last frame" with a stale marker.

---

## 3. Latency budget

### 3.1 Teleop: key press → robot moves → new pose painted

Acceptance target: **p95 < 150 ms locally** (browser, backend, broker and sim on one machine).

| #   | Hop                                   | p50        | p95         | Notes                                      |
| --- | ------------------------------------- | ---------- | ----------- | ------------------------------------------ |
| 1   | keydown → WS frame written            | 1 ms       | 3 ms        | raw listener, no React render on this path |
| 2   | browser → gateway (loopback)          | 1 ms       | 3 ms        | LAN in the field: 5–15 ms                  |
| 3   | authz + lease + rate limit (Redis)    | 1 ms       | 4 ms        | single pipelined round trip                |
| 4   | gateway → broker publish (QoS 0)      | 1 ms       | 3 ms        | fire and forget                            |
| 5   | broker → robot/sim delivery           | 2 ms       | 6 ms        |                                            |
| 6   | bridge → `/cmd_vel` → controller tick | 25 ms      | 50 ms       | 20 Hz control loop quantisation            |
| 7   | pose sampled → MQTT publish           | 50 ms      | 100 ms      | 10 Hz pose quantisation, dominant term     |
| 8   | broker → ingest → Redis → gateway     | 3 ms       | 8 ms        | no DB write on this path                   |
| 9   | gateway → browser                     | 1 ms       | 3 ms        |                                            |
| 10  | receive → interpolate → paint         | 8 ms       | 16 ms       | one 60 Hz frame                            |
|     | **Total**                             | **~93 ms** | **~196 ms** |                                            |

The p95 sum exceeds the target because hops 6 and 7 are quantisation, not delay, and do not stack in the worst case for a _continuous_ key hold — the steady-state measurement (the one the acceptance criterion is about) is "time from a change in command to the first pose reflecting it", where hop 7 contributes its _mean_ half-period. Steady-state p95 lands at ~145 ms. Mitigations if it does not:

- Raise pose to 20 Hz while an operator holds a control lease (drop back to 10 Hz idle).
- Client-side prediction: apply the commanded velocity to the rendered pose immediately, and correct towards each incoming pose with a short interpolation, so the _perceived_ latency is hop 1+10 (~20 ms). The true telemetry age is always shown numerically so prediction never hides a stall.

### 3.2 Video

| Path             | Target glass-to-glass | Budget                                                                                           |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| WebRTC           | < 250 ms p95          | capture 33 ms · encode 20 ms · net 10 ms · jitter buffer 60 ms · decode 15 ms · paint 16 ms      |
| JPEG/WS fallback | < 500 ms p95          | capture 100 ms (10 fps) · JPEG encode 15 ms · WS 5 ms · decode+paint 30 ms · queueing under load |

### 3.3 Other budgets

| Interaction                                 | Target                                                      |
| ------------------------------------------- | ----------------------------------------------------------- |
| Detection published → visible in Crop Scout | < 400 ms p95                                                |
| E-stop tap → robot commanded stop           | < 100 ms p95, and < 300 ms guaranteed by deadman regardless |
| Store home first contentful paint (local)   | < 1.2 s                                                     |
| App-to-app navigation                       | < 100 ms (client-side routing, connection kept)             |
| Analytics overview query                    | < 500 ms p95 (served from continuous aggregates)            |

---

## 4. Safety architecture

Safety is enforced at the layer closest to the actuator. The browser is treated as untrusted and possibly frozen.

| Control                | Where enforced                              | Behaviour                                                                                     |
| ---------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Teleop deadman, 300 ms | **robot bridge / sim**, not browser         | no fresh `cmd/teleop` within 300 ms → zero velocity latched, requires a new command to resume |
| E-stop                 | robot (latching) + backend (state gate)     | idempotent; clears only by explicit operator reset                                            |
| Sprayer interlock      | robot; re-checked in backend before publish | requires armed ∧ inside geofence ∧ speed < limit ∧ tank > 0 ∧ ¬e-stop                         |
| Arming                 | backend + UI confirm                        | explicit confirm; auto-disarm on MQTT disconnect or lease expiry                              |
| Control lease          | backend (Redis, TTL)                        | one operator per robot; others are read-only and see who holds it                             |
| Authorisation          | backend                                     | per-role, per-command; every attempt (allowed or denied) written to `audit_log`               |
| Config apply           | robot ack                                   | config is "pending" in UI until `config/ack` with the matching version arrives                |

The browser duplicates each of these as UI affordances (disabled buttons, confirms) but never as the only barrier.

---

## 5. Failure modes

| Failure                            | Detection                                       | System behaviour                                                                                                                   | Operator sees                                                                                    |
| ---------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Robot loses network                | broker LWT publishes `state=offline` (retained) | commands rejected at the gateway; deadman has already stopped the robot                                                            | "Robot offline · last seen 12 s ago", controls disabled, e-stop shows as unavailable with reason |
| Browser tab killed mid-teleop      | no further `cmd/teleop`                         | robot stops within 300 ms; lease expires on TTL                                                                                    | —                                                                                                |
| WebSocket drops                    | heartbeat miss                                  | client reconnects with exponential backoff + jitter, resumes from last `seq`; gaps in detections are backfilled over REST          | "Reconnecting…", data dimmed with age                                                            |
| Broker restarts                    | ingest client disconnect                        | ingest reconnects with backoff; retained `state` re-delivered; QoS 1 messages redelivered; bridge buffers detections               | brief "Reconnecting to robot"                                                                    |
| Redis down                         | command/pub failures                            | gateway degrades to per-connection polling of last-value from Postgres; commands are **refused** (no lease guarantee = no control) | "Control unavailable" with reason; telemetry read-only                                           |
| Postgres down                      | write errors                                    | ingest buffers to a bounded queue then sheds telemetry (never detections); reads fail fast                                         | error state with next step                                                                       |
| Object store down                  | upload error                                    | detection row persists with `image_key = null` and `image_status = pending`; retried                                               | detection listed, image slot shows "Image not uploaded"                                          |
| Slow consumer / backpressure       | WS send-queue depth                             | drop stale telemetry and pose (keep newest); **never** drop detections, acks, alerts or e-stop responses                           | data age indicator rises                                                                         |
| Clock skew robot vs server         | `ts` vs receive time                            | server records both; age computed from server clock                                                                                | telemetry age from server clock only                                                             |
| Duplicate/out-of-order MQTT        | `seq` per topic                                 | ingest drops older `seq`; detections deduped on `(robot_id, seq)`                                                                  | —                                                                                                |
| Two operators try to drive         | lease held                                      | second gets `control_denied` with holder and expiry; may request takeover (audited)                                                | "Sam has control until 14:32"                                                                    |
| Sprayer commanded outside geofence | PostGIS check in backend + geofence on robot    | command refused, `events` entry, spray blocked at the valve                                                                        | refusal reason on the spray control                                                              |
| Tank empty mid-spray               | sprayer state                                   | auto-disarm, mission pauses                                                                                                        | "Tank empty — refill to continue"                                                                |
| Mission dispatch fails on Nav2     | action rejected/aborted                         | mission → `failed` with reason; robot holds position                                                                               | mission card shows reason + retry                                                                |

---

## 6. Repository layout

```
apps/web/            Next.js App Router frontend (store + 4 apps)
packages/ui/         design tokens + component library (tokens only, no hard-coded colour)
packages/contracts/  JSON Schemas (source of truth) + generated TS types + generated API client
services/api/        FastAPI: REST, WS gateway, MQTT ingest, command service, WebRTC
services/sim-robot/  standalone robot emulator over MQTT
robot/ros2_ws/       ROS 2 workspace, rclpy bridge package
infra/               Docker Compose, broker config, Dockerfiles, local TLS certs (generated)
docs/                this document, PLAN.md, contracts/
```

## 7. Cross-cutting decisions

- **Contracts first.** JSON Schemas in `packages/contracts` are the source of truth; TypeScript types and Pydantic models are generated from them, so a contract change cannot silently diverge between the two sides.
- **`source` is server-controlled.** Every payload carries `source: "sim" | "robot"`, set by the publisher and passed through untouched. The frontend renders the "Simulated" badge from that field only. There is no frontend flag that can turn it off.
- **One clock.** `ts` is UTC nanoseconds everywhere, on the wire and in the DB.
- **Versioning.** `schema_version` on every MQTT payload, `/api/v1` for REST, a version field on each WS channel frame. Contracts are frozen after Phase 1; changes require an explicit new version.
- **Object storage is MinIO-shaped, not MinIO.** The brief specified MinIO; MinIO withdrew its
  community container images and binaries during Phase 0 (Docker Hub and quay.io tags removed,
  `dl.min.io` returns 410). SeaweedFS's S3 gateway replaces it. Application code is unaffected —
  `aioboto3` speaks plain S3 — so this is an infrastructure substitution only, and swapping in
  any other S3 implementation later touches `infra/docker-compose.yml` and nothing else.
- **Observability.** structlog JSON logs with `robot_id` + `trace_id`; OpenTelemetry spans stitched across WS → command → MQTT → ingest → WS so one teleop round trip is a single trace.
