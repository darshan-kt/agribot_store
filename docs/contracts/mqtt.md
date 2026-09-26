# MQTT contract

**Status: frozen at `schema_version` 1.0.0.** A breaking change needs a new major version and a new topic namespace, not an edit to this document.

Payload schemas: [`packages/contracts/schemas/`](../../packages/contracts/schemas/). Those files are the source of truth; this page explains them.

## Namespace

```
agri/v1/{robot_id}/{topic}
```

`robot_id` matches `^[a-z0-9][a-z0-9-]{1,62}$` and is simultaneously the robot's MQTT username, its client id and its topic segment. The broker ACL ([`infra/mosquitto/acl`](../../infra/mosquitto/acl)) binds all three together, so a robot physically cannot publish as another robot — that isolation is tested in the Phase 0 report.

## Envelope

Every message on every topic, in both directions, carries:

| Field            | Type                        | Meaning                                          |
| ---------------- | --------------------------- | ------------------------------------------------ |
| `schema_version` | `"1.0.0"`                   | Version of the payload schema.                   |
| `robot_id`       | string                      | Must equal the topic's robot segment.            |
| `ts`             | integer                     | UTC **nanoseconds**, from the publisher's clock. |
| `seq`            | integer                     | Monotonic per (robot, topic).                    |
| `source`         | `sim` \| `robot` \| `cloud` | Who produced the value.                          |

Two rules about these that the rest of the system depends on:

- **`ts` is not trusted for age.** The server records its own receive time. Anything the operator sees as "last seen 12 s ago" is computed from the server clock, because a robot with a skewed clock must not be able to make stale data look fresh.
- **`source` is the only thing that drives the "Simulated" badge.** It is set by the publisher and passed through the backend untouched. Uplink messages are only ever `sim` or `robot`; `cloud` appears solely on downlink commands, whose origin is an operator rather than a sensor.

## Up: robot → cloud

| Topic              | Rate             | QoS   | Retain  | Payload                                                                                 | Notes                                                                                                        |
| ------------------ | ---------------- | ----- | ------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `state`            | on change        | 1     | **yes** | [`up/state.json`](../../packages/contracts/schemas/up/state.json)                       | LWT is this payload with `online: false`, `reason: "lwt"`. Retained, so a browser sees liveness immediately. |
| `telemetry`        | 1–10 Hz          | 0     | no      | [`up/telemetry.json`](../../packages/contracts/schemas/up/telemetry.json)               | Battery, signal, uptime, compute. First thing dropped under backpressure.                                    |
| `sensors`          | 1 Hz             | 0     | no      | [`up/sensors.json`](../../packages/contracts/schemas/up/sensors.json)                   | Per-sensor readings and ok/check/fault, decided on the robot.                                                |
| `pose`             | 10 Hz            | 0     | no      | [`up/pose.json`](../../packages/contracts/schemas/up/pose.json)                         | Interpolated client-side; true age always shown numerically.                                                 |
| `detections`       | event            | **1** | no      | [`up/detections.json`](../../packages/contracts/schemas/up/detections.json)             | One message per analysed frame. Never dropped.                                                               |
| `sprayer/state`    | 2 Hz + on change | 0     | no      | [`up/sprayer-state.json`](../../packages/contracts/schemas/up/sprayer-state.json)       | Includes each interlock individually.                                                                        |
| `mission/progress` | on change        | 1     | no      | [`up/mission-progress.json`](../../packages/contracts/schemas/up/mission-progress.json) |                                                                                                              |
| `config/ack`       | on change        | 1     | no      | [`up/config-ack.json`](../../packages/contracts/schemas/up/config-ack.json)             | Echoes the effective config, not the requested one.                                                          |
| `events`           | event            | 1     | no      | [`up/events.json`](../../packages/contracts/schemas/up/events.json)                     | Discrete occurrences; safety kinds become alerts and audit rows.                                             |

### Why these QoS levels

QoS 0 for `telemetry`, `sensors` and `pose` is deliberate. They are sampled values where the next sample supersedes the last, so redelivering a stale one costs more than dropping it. QoS 1 for `detections`, `mission/progress`, `config/ack` and `events` is equally deliberate: each is individually meaningful, and losing one loses a plant nobody inspects or a command nobody confirmed. Duplicates from QoS 1 redelivery are handled by `seq`, and detections additionally by their robot-generated `detection_id`.

## Down: cloud → robot

| Topic         | QoS   | Payload                                                                           | Notes                                               |
| ------------- | ----- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| `cmd/teleop`  | 0     | [`down/cmd-teleop.json`](../../packages/contracts/schemas/down/cmd-teleop.json)   | **The deadman.** See below.                         |
| `cmd/estop`   | **1** | [`down/cmd-estop.json`](../../packages/contracts/schemas/down/cmd-estop.json)     | Own topic so it never queues behind telemetry.      |
| `cmd/mission` | 1     | [`down/cmd-mission.json`](../../packages/contracts/schemas/down/cmd-mission.json) | `start` maps to a Nav2 `NavigateThroughPoses` goal. |
| `cmd/sprayer` | 1     | [`down/cmd-sprayer.json`](../../packages/contracts/schemas/down/cmd-sprayer.json) | Opens a pesticide valve. Interlocked at both ends.  |
| `config/set`  | 1     | [`down/config-set.json`](../../packages/contracts/schemas/down/config-set.json)   | Versioned; pending until acked.                     |

Every downlink message carries `issued_by` (the operator's user id) and, where a control lease applies, `lease_id`. A command with no attributable operator is rejected before it reaches the broker.

## Safety properties this contract encodes

1. **Teleop deadman, 300 ms.** The robot latches zero velocity if no valid `cmd/teleop` arrives within 300 ms, enforced on the robot and not in the browser. A frozen tab, a dropped link and a killed process are therefore all the same event: the machine stops. `cmd/teleop` is QoS 0 because a redelivered stale velocity is more dangerous than a dropped one.
2. **E-stop is idempotent and unprivileged-by-lease.** Engaging an already-engaged e-stop is a no-op, so the UI may retry freely. It bypasses the lease check and the rate limiter: any authenticated operator with a control role may stop any robot, including one they do not hold control of. `engage: false` is an explicit human reset, not an automatic inverse.
3. **The sprayer needs five conditions, checked twice.** Armed, inside the geofence, under the speed limit, tank not empty, no e-stop. The backend checks all five before publishing; the robot checks the same five before actuating. `sprayer/state` reports each one separately so the UI can name the specific blocker rather than refusing opaquely.
4. **Arming is explicit and self-reversing.** `action: "arm"` requires `confirmed: true`, recording that a human passed a confirmation step. Arming auto-reverses on disconnect or lease expiry.
5. **Bursts are bounded.** `duration_ms` on a spray is capped at 30 s in the schema, and the robot applies its own maximum too, so a lost `spray_stop` cannot empty the tank.
6. **Config is pending until acked.** The UI shows a setting as applied only after `config/ack` returns the matching `config_version`.
