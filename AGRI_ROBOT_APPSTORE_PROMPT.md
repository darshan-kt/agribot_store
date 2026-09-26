# Agri Robot App Store — Claude Code build prompt

Paste everything below the line into Claude Code, run from an empty repo root.

---

## Role

You are a principal full-stack robotics engineer, the kind who has shipped fleet software at NVIDIA, Google and Meta. You design for real hardware first: latency budgets, lossy field networks, safety interlocks, observability, and a UI a farmer can use in direct sunlight with dirty hands. You prefer boring, proven infrastructure and put the creativity into the product. You never fake a capability; if something is stubbed, it is labelled as stubbed in code and in the UI.

## Objective

Build a production-grade **Agri Robot App Store**: a web platform where a farmer or operator opens four apps that control and analyse an agricultural field robot. The system talks to real robots through **ROS 2 ↔ MQTT ↔ FastAPI ↔ WebSocket ↔ browser**, and it ships with a **simulated robot** that speaks exactly the same protocol, so the whole stack runs end to end with no hardware.

## Context (carry forward, all decisions locked)

This is a working POC being turned into a real product. The UX below was designed and validated interactively; reproduce it faithfully, do not redesign it.

**The store home**

- Header "Agri Robot Store", connected robot strip (name, online dot, field, battery), search, category chips (Field ops, Insights, Robot), a featured app (Crop Scout), a grid of app cards with live badges (for example "14 critical" on Crop Health, "1 check" on Dashboard), and a "Plan → Scout → Analyse → Spray" flow strip.
- Every app has a back link to the store. Navigation between apps is instant (client-side routing, shared robot connection).

**App 1: Dashboard** (kept basic on purpose)

- Robot identity: name, model, firmware, online state.
- Status cards: battery % and time remaining, signal dBm, uptime, current field and row.
- Sensors list with live readings and OK/Check status: left and right camera (resolution, fps), RTK GPS (fix type, accuracy, satellites), IMU, front lidar (nearest obstacle), weather sensor (temperature, humidity, with a "High humidity, blight risk" warning), wheel encoders.
- Onboard computer: CPU, GPU, memory, temperature bars, detection fps, storage.
- Configuration: max drive speed, detection sensitivity (with plain-language hint), return-to-base battery %, camera frame rate, obstacle stop toggle, "Save to robot" (versioned, acknowledged by the robot).

**App 2: Crop Scout** (the primary app)

- Left and right camera feeds on the sides, annotated with bounding boxes coloured by severity, labelled with issue and confidence.
- Centre panel: field map with the robot's live pose, driven trajectory and severity pins.
- Bottom: teleop bar (on-screen D-pad plus W A S D / arrows, space = stop, slow/normal/fast).
- Report panel: plants scanned, flagged, infection rate, severity stacked bar, counts by issue, scrolling detection log.
- "Start scouting" runs an autonomous snake pattern; manual driving also produces detections.

**App 3: Crop Health Analytics** (for technical and non-technical users alike)

- Overview: metric cards, a single plain-language alert sentence ("Late blight is spreading in rows 6 to 9 after last week's rain. Check the 14 critical plants within 2 days."), severity mix, disease bars with plain labels ("fungus", "insect"), trend across scouting runs against an action threshold.
- Field map: every flagged plant as a tappable dot.
- Hotspots: severity filter, list, detail view with the annotated sample image, GPS coordinates, row and metres from field edge, "What it is", "What to do", Copy GPS, Mark inspected.

**App 4: Mission Planner**

- Two modes with a clear switch: **Autonomous** (waypoint trajectory: snake rows, perimeter, or tap-to-draw custom waypoints) and **Remote control** (teleop keyboard, heading, distance driven).
- Pesticide sprayer panel: Arm switch, nozzle height (20–90 cm) with a live side-view rig illustration, spray rotation 180° front / 360° full, flow rate (L/min), tank level with low/empty warnings and refill, hold-to-spray, and auto-spray of flagged plants during a mission. Treated plants change from red to green on the map; sprayed areas leave a trace.

**Design language (locked)**

- Light, daylight-readable palette: bg `#E4EADF`, card `#F7F9F4`, ink `#1C2A21`, primary green `#1F6B4A`, info blue `#3E7CB1`. Provide a dark theme too, but light is default.
- Severity scale, always paired with a text label, differing in lightness as well as hue: low `#F0CF6B`, moderate `#E8873A`, critical `#B8321F`.
- Type: Bricolage Grotesque (display), Instrument Sans (UI), JetBrains Mono (telemetry numbers, tabular figures).
- Copy is plain language, sentence case, no jargon in farmer-facing surfaces.
- Any value that is not from a real sensor MUST carry a visible "Simulated" badge driven by a `source: "sim" | "robot"` field from the backend, never by a frontend flag. Simulated data must never be indistinguishable from real data.

## Target architecture

```
[ROS 2 robot]  ── rclpy bridge node ──  MQTT (TLS, QoS) ──  [FastAPI ingest + command service]
      ▲                                                          │        │
  Nav2, sensors, vision node, sprayer controller          PostgreSQL+PostGIS+Timescale, Redis, S3 (MinIO)
                                                                 │
                                                  WebSocket gateway ── Browser (store + 4 apps)
                                                  WebRTC (camera video) ─┘
[sim-robot] publishes/consumes the identical MQTT contract
```

**Approved stack** (ask before adding anything outside this list):

- Monorepo: pnpm workspaces + Turborepo. Python managed with `uv`.
- Frontend `apps/web`: Next.js (App Router) + TypeScript strict, Tailwind with CSS-variable design tokens, Radix primitives, Motion (framer-motion) for animation, TanStack Query, Zustand for realtime state, MapLibre GL for GPS field maps, visx or Recharts for charts, Vitest + Playwright.
- Backend `services/api`: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 async + asyncpg, Alembic, `aiomqtt`, `redis` asyncio, `aiortc` for WebRTC, structlog, OpenTelemetry, pytest + pytest-asyncio.
- Data: PostgreSQL 16 with PostGIS and TimescaleDB, Redis 7, MinIO (S3 API) for images.
- Broker: EMQX or Mosquitto with TLS and per-robot credentials.
- Robot side `robot/ros2_ws`: ROS 2 Jazzy (Humble compatible), rclpy bridge package, Nav2 `NavigateThroughPoses`, `robot_localization` navsat transform for GPS ↔ map frame.
- `services/sim-robot`: Python process emulating a robot over MQTT (pose, sensors, camera frames, detections, sprayer physics, battery drain).
- Infra: Docker Compose for local, one `make dev` to start everything.

## Contracts (define these first, generate types from them)

1. **MQTT topics** under `agri/v1/{robot_id}/…`, documented in `docs/contracts/mqtt.md` with payload JSON Schemas in `packages/contracts/`:
   - Up (robot → cloud): `state` (retained, LWT = offline), `telemetry` (1–10 Hz, QoS 0), `sensors`, `pose`, `detections` (QoS 1), `sprayer/state`, `mission/progress`, `config/ack`, `events`.
   - Down (cloud → robot): `cmd/teleop` (QoS 0, carries seq + timestamp), `cmd/estop` (QoS 1), `cmd/mission` (QoS 1), `cmd/sprayer` (QoS 1), `config/set` (QoS 1, versioned).
   - Every message: `schema_version`, `robot_id`, `ts` (UTC ns), `seq`, `source`.
2. **WebSocket** `/ws/robots/{id}` with typed, versioned channels (telemetry, pose, detections, sprayer, mission, alerts) and client commands. Heartbeats, reconnect with backoff, resume from last seq, backpressure (drop stale telemetry, never drop detections or acks).
3. **REST** (OpenAPI-first) for store catalog, robots, fields, missions, scouting runs, detections, analytics aggregates, inspections, config history, exports. Generate the TypeScript client from OpenAPI.
4. **ROS 2 mapping** in `docs/contracts/ros2.md`: which topics, services and actions the bridge maps to each MQTT topic (`/cmd_vel`, `/navigate_through_poses`, `/sprayer/command`, `/fix`, `/imu`, `/scan`, `/camera/{left,right}/image_raw/compressed`, `/detections`, `/battery_state`, `/diagnostics`).

## Database (PostgreSQL + PostGIS + Timescale), migrations via Alembic

Tables, with UUID PKs, `created_at`/`updated_at`, foreign keys and indexes:
`users` (roles: farmer, operator, admin), `organizations`, `robots`, `robot_config_versions`, `fields` (PostGIS polygon), `field_rows` (linestring, row number), `store_apps`, `app_installs`, `missions` (mode, pattern, status), `mission_waypoints` (ordered, geography point), `scout_runs`, `detections` (run, issue, severity, confidence, bbox, camera side, geography point, row, metres from edge, image key, source), `issue_catalog` (plain-language name, type fungus/insect/etc., "what it is", "what to do"), `inspections` (detection, user, status, note), `spray_events` (geography point, duration, flow, arc, nozzle height, litres), `telemetry` and `sensor_readings` as Timescale hypertables with retention and continuous aggregates, `audit_log` for every command sent to a robot.
Seed script creates one org, one field "B-4" (tomato, 9 rows), one robot "Scout-01", the four store apps, the issue catalog (early blight, late blight, leaf mold, aphid colony, spider mites, leaf miner) and a week of historical sim scouting runs so Analytics is populated on first run.

## Safety requirements (non-negotiable, this drives a physical machine with pesticide)

- Teleop deadman: the robot stops if no fresh `cmd/teleop` within 300 ms. Enforced on the robot side, not only in the browser.
- E-stop is always visible in every control app, one tap, idempotent, highest priority path.
- Sprayer cannot actuate unless: armed, robot inside field geofence, speed under limit, tank > 0, no e-stop. Arming requires an explicit confirm. Auto-disarm on disconnect.
- Only one operator holds control of a robot at a time (control lease with expiry, visible to others).
- Every command is authorised by role, rate-limited and written to `audit_log`.
- Config changes are versioned and only shown as applied after the robot acks them.

## UI/UX and taste bar

- If a frontend-design or UI skill is available in this environment, read it before writing any UI.
- Build a small token-based design system first (`packages/ui`): colour, type scale, spacing, radius, elevation, motion durations and easings, severity scale. Every component consumes tokens only.
- Motion with purpose: camera crop drift and scanline on feeds, bounding boxes scaling in, robot pose interpolated smoothly (never teleporting between telemetry ticks), pulsing online dot, key-press feedback on teleop, bars growing on load, list rows fading in, spray mist on the map and rig. All disabled under `prefers-reduced-motion`.
- Designed states for everything: loading skeletons, empty, offline robot, reconnecting, stale data (dim plus "Last seen 12 s ago"), permission denied, error with a next step.
- Responsive: phone (380 px) for the store, Dashboard and Analytics; Crop Scout and Mission Planner are optimised for tablet and desktop (1280–1440 px) and remain usable on phone. Touch targets ≥ 44 px, WCAG AA contrast, full keyboard support, visible focus.
- Avoid generic AI-looking UI: no purple gradients, no glassmorphism, no emoji icons, no default shadcn look left untouched.

## Build plan, one phase at a time

Work strictly phase by phase. At the end of each phase, stop, report, and wait for my "continue".

0. **Plan**: write `docs/ARCHITECTURE.md` (diagram, data flow, latency budget for teleop and video, failure modes) and `docs/PLAN.md`. Scaffold the monorepo, Docker Compose, `make dev`, lint, format, CI workflow file.
1. **Contracts and data**: JSON Schemas, MQTT and WS docs, OpenAPI skeleton, SQLAlchemy models, first Alembic migration, seed script.
2. **Backend core**: FastAPI app, auth (JWT, roles), MQTT ingest workers, Redis fan-out, WebSocket gateway, command service with safety checks and audit log, REST endpoints, image upload to MinIO.
3. **Sim robot**: full emulation over MQTT including detections with images, mission following, sprayer physics, battery, deadman behaviour.
4. **Design system and store shell**: tokens, core components, store home, routing, shared robot connection store, e-stop component.
5. **Dashboard**.
6. **Crop Scout** (WebRTC video with JPEG-over-WS fallback, teleop, live detections, report).
7. **Mission Planner** (both modes, waypoint editor on MapLibre, sprayer panel, Nav2 mission dispatch).
8. **Crop Health Analytics** (aggregates from continuous aggregates, hotspots, detail view, inspections, CSV/PDF export).
9. **ROS 2 bridge package**: rclpy node, launch file, params, QoS profiles, reconnect, deadman on the robot side, unit tests with `launch_testing`.
10. **Hardening**: load test WS fan-out, chaos test (broker restart, network drop mid-teleop), OpenTelemetry traces end to end, README with runbook.

## Scope

- Work only inside this repository. Create the structure: `apps/web`, `packages/ui`, `packages/contracts`, `services/api`, `services/sim-robot`, `robot/ros2_ws`, `infra`, `docs`.
- Do NOT commit secrets. All credentials come from environment variables documented in `.env.example`.
- Do NOT push to any git remote, publish packages, or connect to a real robot or broker outside Docker Compose.

## Action boundaries

- Proceed without asking on reversible, in-scope work: creating files in the structure above, installing packages from the approved stack, running tests, linters and local containers.
- Stop and ask before: adding any dependency outside the approved stack, deleting files, destructive migrations or dropping data, changing a published contract after Phase 1, anything touching real hardware, or any scope beyond this brief.
- Only build what is described here. No extra features, no speculative abstractions.

## Acceptance criteria

- [ ] `make dev` starts the full stack; the store loads at `http://localhost:3000` with the sim robot online.
- [ ] Driving in Crop Scout moves the sim robot with p95 command-to-pose-update under 150 ms locally; releasing keys stops it within 300 ms even if the browser tab is killed.
- [ ] Detections from the sim appear live in Crop Scout and persist, then show up in Analytics with image, GPS and row.
- [ ] A snake mission from Mission Planner runs on the sim, auto-sprays flagged plants, records `spray_events`, and refuses to spray when disarmed or outside the geofence.
- [ ] Every sim-sourced value shows a "Simulated" badge; values from the bridge do not.
- [ ] Backend tests, frontend unit tests and a Playwright happy path per app pass in CI.
- [ ] Lighthouse accessibility ≥ 95 on store, Dashboard and Analytics.

## Progress reporting

After each phase report: files created or changed, commands run with their real output (tests, lint, migrations), what is stubbed and why, and open questions. Base every "done" claim on an actual tool result. Keep reports short.
