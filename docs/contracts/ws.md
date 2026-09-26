# WebSocket contract

**Status: frozen.** Endpoint `/ws/robots/{robot_id}`, one connection per robot per browser tab. Channel names and frame shapes live in [`packages/contracts/src/topics.ts`](../../packages/contracts/src/topics.ts).

## Frame shape

Server → client:

```jsonc
{
  "v": 1, // channel frame version
  "ch": "pose", // channel
  "seq": 128412, // server sequence, per (robot, channel)
  "ts": 1790330595041881363,
  "recv_ts": 1790330595043100000, // server receive time; age is computed from this
  "data": {/* the MQTT payload for that topic, unchanged */},
}
```

Client → server:

```jsonc
{ "v": 1, "op": "subscribe",  "channels": ["pose", "telemetry", "detections"] }
{ "v": 1, "op": "resume",     "from": { "detections": 128400 } }
{ "v": 1, "op": "command",    "kind": "teleop", "data": { /* cmd payload */ } }
{ "v": 1, "op": "ping" }
```

`data` on an uplink channel is the MQTT payload verbatim, envelope included. The gateway does not reshape it, so `source` survives end to end and a schema change lands in one place.

## Channels

| Channel      | Source topic                        | Droppable under load       |
| ------------ | ----------------------------------- | -------------------------- |
| `telemetry`  | `telemetry`                         | **yes** — keep newest only |
| `pose`       | `pose`                              | **yes** — keep newest only |
| `camera`     | JPEG fallback frames                | **yes** — keep newest only |
| `detections` | `detections`                        | no                         |
| `sprayer`    | `sprayer/state`                     | no                         |
| `mission`    | `mission/progress`                  | no                         |
| `alerts`     | `events` (warning and critical)     | no                         |
| `control`    | lease grants, denials, command acks | no                         |

The split is the whole backpressure policy: sampled values may be discarded because the next one supersedes them; discrete events may not, because each is individually meaningful. `isLossyChannel()` in the contracts package is the single definition, so the gateway and the client cannot disagree about it.

## Heartbeats and liveness

- Server sends a `ping` frame every 15 s; the client answers `pong`.
- A client that misses two consecutive pings is disconnected, which releases its control lease.
- The client reconnects with exponential backoff and jitter: 0.5 s, 1 s, 2 s, 4 s, 8 s, capped at 15 s.
- **Disconnecting does not stop the robot by itself** — the 300 ms robot-side deadman already has. The lease release just means someone else can take control.

## Resume

On reconnect the client sends `resume` with the last `seq` it saw per non-lossy channel. The gateway replays what it still holds in Redis; anything older is fetched over REST instead, so a detection produced during a 40 s outage still arrives. Lossy channels are never replayed — the client gets the current value and moves on.

## Backpressure

Each connection has a bounded send queue. When it fills:

1. Lossy channels collapse to their newest frame.
2. If that is not enough, the connection is marked slow and its lossy channels are paused, with a `control` frame telling the client so — the UI dims the live values rather than silently showing stale ones.
3. Non-lossy frames are never dropped. If the queue still cannot drain, the connection is closed so the client reconnects and resumes cleanly.

## Errors and refusals

A refused command comes back on `control`, never as a silent no-op:

```jsonc
{
  "v": 1,
  "ch": "control",
  "data": {
    "kind": "command_rejected",
    "command": "sprayer",
    "reason": "outside_geofence",
    "detail": "Robot is 4.2 m outside field B-4.",
  },
}
```

`reason` is a machine code from a closed set; the sentence a farmer reads is composed in the frontend from that code. Lease denials additionally carry the holder's display name and the lease expiry, so the UI can say who has control rather than just refusing.
