# Build plan

Work proceeds strictly one phase at a time. Each phase ends with a short report (files changed, commands run with real output, what is stubbed and why, open questions) and waits for an explicit "continue".

Legend: ✅ done · 🚧 in progress · ⬜ not started · 👤 owned by Darshan

**Division of work (agreed 2026-09-25, during Phase 1).** Darshan takes the backend services and
builds them his own way; this workstream covers the UI and the database. Phases below are marked
accordingly. The contracts in `packages/contracts` and `docs/contracts/` are the seam between the
two: the UI codes against them, and the backend implements them.

---

## Phase 0 — Plan and scaffold ✅

**Deliverables**

- `docs/ARCHITECTURE.md` — system diagram, data flow, teleop and video latency budgets, safety architecture, failure-mode table.
- `docs/PLAN.md` — this file.
- Monorepo scaffold: pnpm workspaces + Turborepo, `tsconfig.base.json`, ESLint flat config, Prettier.
- Python workspaces for `services/api` and `services/sim-robot` managed with `uv` (Ruff + mypy + pytest configured).
- `infra/docker-compose.yml`: Postgres 16 (PostGIS + TimescaleDB), Redis 7, SeaweedFS S3 gateway, Mosquitto (TLS + per-robot credentials), api, sim-robot, web.
- `make dev` and the rest of the Makefile; `.env.example`; CI workflow.

**Exit criteria**

- `make dev` brings the stack up; every container reports healthy; `/healthz` answers; the web placeholder loads.
- `make lint`, `make format-check`, `make typecheck`, `make test` all run (they pass on empty scaffolds).

**Deviation from the brief:** object storage is SeaweedFS's S3 gateway, not MinIO. MinIO withdrew
its community container images and binaries; the substitute was approved and is infrastructure-only.

**Stubbed on purpose:** the API exposes only health endpoints, the sim robot only connects and idles, and the web app renders a scaffold notice. All three are replaced in Phases 2–4.

---

## Phase 1 — Contracts and data ✅

- JSON Schemas for every MQTT payload in `packages/contracts/schemas/`, one file per topic, with `schema_version`, `robot_id`, `ts`, `seq`, `source` on all of them.
- `docs/contracts/mqtt.md` (topics, QoS, retain, LWT, direction, rate), `docs/contracts/ws.md` (channels, frames, heartbeat, resume, backpressure rules), `docs/contracts/ros2.md` (topic/service/action mapping for the bridge).
- OpenAPI skeleton for `/api/v1`; TS types generated from schemas and from OpenAPI (`pnpm gen`).
- SQLAlchemy 2 models for every table in the brief, first Alembic migration (PostGIS + Timescale hypertables, continuous aggregates, retention policies).
- Seed script: one org, field "B-4" (tomato, 9 rows), robot "Scout-01", four store apps, issue catalog, one week of historical sim scouting runs.

**Exit criteria (met):** `make migrate` and `make seed` run against the compose Postgres; generated types compile; contracts frozen from here.

**Note on the seed:** the numbers are produced by the data, not written into the UI. The seeded week of
scouting runs actually contains 14 outstanding critical late-blight findings in rows 6–9, so the alert
sentence and the "14 critical" store badge are counts, not strings.

**Stubbed on purpose:** detections are seeded with `image_key = null`. The seed does not invent
photographs, so Analytics renders its "image not uploaded" state — which is the same state a real
detection shows while its upload is pending.

---

## Phase 2 — Backend core 👤

**Owned by Darshan.** The contract to implement is [`packages/contracts/openapi.yaml`](../packages/contracts/openapi.yaml),
[`docs/contracts/mqtt.md`](./contracts/mqtt.md) and [`docs/contracts/ws.md`](./contracts/ws.md). The
database layer it builds on (models, migrations, seed) is already done and lives in `services/api/src/agri_api/db/`.

FastAPI app factory, settings, structlog, OpenTelemetry. JWT auth with farmer/operator/admin roles. MQTT ingest workers (one subscription group, per-topic handlers, batched Timescale writes). Redis fan-out and last-value cache. WebSocket gateway `/ws/robots/{id}` with typed channels, heartbeats, resume-from-seq and backpressure. Command service with the full safety chain (authz → lease → rate limit → preconditions → audit → publish). REST endpoints. Image upload to the S3 object store.

**Exit criteria:** pytest suite covering safety refusals; a command published to the broker is visible with `mosquitto_sub`; WS client receives fan-out.

---

## Phase 3 — Sim robot 👤

**Owned by Darshan.** Must publish the schemas in `packages/contracts/schemas/up/` and consume those
in `down/`. Pose integration and kinematics, sensor synthesis (GPS/IMU/lidar/weather/encoders), JPEG camera frames for both cameras, detection generation with cropped sample images, mission following (snake, perimeter, custom waypoints), sprayer physics (tank, flow, arc, nozzle height, mist), battery drain, deadman, LWT, config ack.

**Exit criteria:** with only the broker and sim running, `mosquitto_sub` shows a complete, schema-valid stream; the sim stops within 300 ms of teleop silence.

---

## Phase 4 — Design system and store shell ✅

Until the backend exists, the UI reads through a typed data layer with two interchangeable
implementations behind one interface: `http` against the OpenAPI spec, and a fixture source built
from the seeded database. Swapping to the real backend is a configuration change, not a rewrite.

`packages/ui`: tokens (colour, type scale, spacing, radius, elevation, motion, severity), then components built on Radix + Tailwind consuming tokens only. Store home exactly as specified (header, robot strip, search, category chips, featured Crop Scout, app grid with live badges, flow strip). App Router layout, client-side routing, shared robot connection store (Zustand + TanStack Query), the always-visible E-stop component, and the `Simulated` badge driven by `source`.

**Done:** tokens (colour, type scale, radius, elevation, motion, severity) in `packages/ui/src/tokens.css`,
with light and dark defined once each and applied across all three viewer states. Core components —
Button, Card, Metric, Eyebrow, SeverityChip, SeverityBar, StatusDot, SimulatedBadge, EstopButton, and the
loading / empty / error / stale states. Store home with header, robot strip, search, category chips,
featured Crop Scout, app grid with live badges and the Plan → Scout → Analyse → Spray strip.
Theme toggle (light / dark / auto) with no flash of the wrong theme on load.

**Still open for this phase:** Lighthouse accessibility has not been measured yet, and the shared
realtime robot store (Zustand + TanStack Query) is deferred until there is a WebSocket to subscribe to —
the store home reads a snapshot, so nothing needed it yet.

---

## Phase 5 — Dashboard ✅

Identity, status cards (battery with a two-hour sparkline, signal, uptime, field and row), sensor list with
plain-language readings and OK/Check, onboard computer load bars, and the configuration form. Settings are
shown as applied only when the robot has acknowledged that version.

Also built here because every app needs them: the shared `AppShell` (back link, robot liveness, e-stop) and
`livenessOf()`, which derives online/stale/offline from how long ago the robot was last heard from rather
than trusting a cached flag — so a fixture exported hours ago degrades honestly instead of claiming to be live.

**Stubbed:** the e-stop and "Save to robot" have no command service to call yet, so both refuse with a
stated reason rather than animating success they did not achieve.

## Phase 6 — Crop Scout ✅

Dual camera feeds (WebRTC, JPEG/WS fallback) with severity-coloured boxes, field map with live pose and trajectory, teleop bar (D-pad + WASD/arrows, space = stop, speed modes), report panel, autonomous snake scouting.

**Done:** the three-panel workspace — cameras either side, field map between them, teleop across the
bottom, report and detection log beneath — with one selection shared by map, log and camera box, so a
pin tapped on the map is the row that scrolls into view in the log. The map is drawn from the field's
real PostGIS geometry (`lib/geo.ts`), rotated a quarter turn because B-4 is 16 m by 100 m and is
unreadable north-up in a landscape panel; a test holds the rotation against the seeded rows rather
than trusting the comment. The report scopes to the most recent run and quotes the robot's own
scanned count and infection rate instead of recomputing them — the run says 37 flagged and its window
contains exactly those 37.

Teleop is built as pure functions (`lib/scout/teleop.ts`) plus the React that calls them, so the part
that drives a machine is testable without a DOM: opposing keys cancel to a stop, speed mode scales the
robot's configured maximum and never exceeds it, the send rate fits three commands inside the 300 ms
deadman window, and typing in a text field cannot drive the robot.

**Stubbed, and visible as such on screen:**

- **No video.** WebRTC and the JPEG fallback both come from the backend. Both panels render the
  "no video" state — with no scanline and no crop drift, because motion implying a live image when
  there is none is the worst thing that panel could do. The boxes are real: they arrive on
  `detections` rather than on the video, so the newest box per camera is drawn at its recorded
  position and the panel says the frame behind it was never stored.
- **No live pose.** `pose` is a WebSocket channel, so there is no robot marker and no interpolation.
  The row the robot last reported is highlighted and labelled as a report. The dashed line is the
  order the plants were found in, labelled as that — not a logged trajectory.
- **Teleop sends nothing.** `onCommand` is the wiring point for the WS `command` op. Absent, the bar
  still resolves a velocity but the repeat loop does not run, and it says plainly that nothing is
  reaching a robot.
- **"Start scouting" refuses** with its reason. An autonomous run is a `cmd/mission`, and a progress
  bar over a command that was never sent would be an animation of nothing.

**Also fixed here:** three mypy errors in the Phase 1 fixture exporter that were failing
`make typecheck` (SQLAlchemy types a labelled `func.count()` as `Any`, which left the critical count
untyped on the way out of `export_analytics`).

**Not used:** MapLibre, though it is in the approved stack. The map is nine parallel lines and a
rectangle with no tiles to fetch. Phase 7 reached the same conclusion for tap-to-draw and recorded
why; the projection now lives in `components/map/field-canvas.tsx`, shared by both apps.

## Phase 7 — Mission Planner ✅

Autonomous mode (snake / perimeter / tap-to-draw waypoints) and remote-control mode, Nav2 mission
dispatch, sprayer panel (arm, nozzle height with live rig illustration, 180°/360° arc, flow rate,
tank + refill, hold-to-spray, auto-spray of flagged plants), treated plants turning green, spray traces.

**Done.** Two modes behind one switch, because they are different jobs: autonomous plans a route and
hands it over, remote control gives the operator the same teleop bar Crop Scout uses. The routes are
expanded from the field's real PostGIS geometry in `lib/mission/plan.ts` — a snake is the nine seeded
rows walked end to end alternating direction (18 points, 912 m, which is 900 m of row plus the eight
transits), a perimeter is the boundary inset by the robot's turning clearance. What the planner draws
is a preview: `cmd/mission` says the backend expands snake and perimeter from the same rows, so
`missionInputFor` sends the _pattern_ for those and explicit points only for a custom route. The
request it would POST is shown on screen, collapsed — the backend is being written separately and
that is the exact body it has to accept.

**Sprayer.** Every interlock is three-state — `ok`, `blocked`, `unknown` — and only `ok` permits.
With no robot reporting, all five read "the robot has not reported" and hold-to-spray stays disabled:
an unreported interlock is not a satisfied one, and a green tick next to an unchecked geofence is the
single most dangerous thing this panel could draw. The three states are a shape as well as a colour
(tick, cross, question), since two of them being red distinguishes them for nobody who cannot see
red. Arming takes a second confirmation that names what is being armed. The rig illustration is
drawn in centimetres from the same cone geometry the map uses for coverage discs, so the picture and
the numbers cannot drift apart: 45 cm sprays a 0.52 m band ahead, 90 cm sprays 1.04 m all round.

**Treated plants are green because a spray event says so.** The eleven green dots and the coverage
discs come from `spray_events` rows recorded on the 24th, each naming the detection it treated and
carrying the litres and nozzle height actually used. Those plants are three weeks of runs away from
the 37 the latest run flagged, so the page carries both sets in: scoping to the newest run alone
would have drawn a field that looks untouched when it is not.

**Shared with the other apps, built here:** `components/map/field-canvas.tsx` now owns the projection,
the quarter-turn rotation and the field furniture for every map in the product; Crop Scout's map was
moved onto it and its tests still hold the rotation. Teleop moved from `lib/scout/` and
`components/scout/` to `lib/control/` and `components/control/` when a second app needed it. `geo.ts`
gained the inverse projection (`pointAt`) that tap-to-draw depends on, plus `bearingDeg` for waypoint
headings.

**Stubbed, and visible as such on screen:**

- **Starting a mission refuses** with its reason. `POST /missions` and `cmd/mission` are the command
  service's, and a progress bar over a command that was never published would be an animation of nothing.
- **Nothing is armed and no spray is possible.** The sprayer's state arrives on the `sprayer`
  WebSocket channel; arm, configure, refill and spray all go out through the command service. All
  four refuse and say why.
- **No live pose**, so no robot marker, and remote control shows heading and distance driven as "not
  reported" rather than as zero — 0° is north, not unknown, and 0 m would claim the robot has not moved.
- **Auto-spray** is a flag on the mission, which is real; it has no effect until the sprayer is armed,
  and the panel says so.

**Deviation from the brief: MapLibre is not used, here or anywhere.** The brief names it for
tap-to-draw waypoints over imagery. There is no tile source in this project and no imagery to put
under the field — adding one means an external provider and a key, which is outside the approved
stack and outside "no network beyond Docker Compose". Without tiles MapLibre would render the same
nine lines and one rectangle through WebGL, at the cost of a dependency that cannot draw anything in
a field with no signal. The SVG canvas projects from the same geometry, inverts cleanly for
tap-to-draw, and renders offline. **Open question for Darshan:** if satellite imagery is wanted
later, say which provider, and the canvas becomes a MapLibre layer over it.

**Also fixed here:** one pre-existing lint error in the Phase 6 Playwright spec (an inline
`import()` type annotation), which was failing `make lint`.

**Tests.** 56 new unit tests — the planner against the seeded field (snake covers every row and never
transits further than the row spacing; perimeter closes and stays inside the fence; custom routes
renumber with no gaps; the request body carries the pattern, not the preview), the interlock chain
(unknown never permits, one blocked condition is enough, the robot's own `blocked_reason` beats the
UI's precedence order), and the panel and workspace. Eleven Playwright tests, including tap-to-draw:
`getScreenCTM` has no jsdom implementation, so the map's inverse projection is only ever exercised in
a real browser. That test found a real bug — the boundary polygon was swallowing clicks inside the
field, which is precisely where someone placing a waypoint taps.

## Phase 8 — Crop Health Analytics ✅

Overview cards, the plain-language alert sentence, severity mix, disease bars with plain labels, trend
against action threshold, field map of flagged plants, hotspots list + detail (sample image, GPS, row,
metres from edge, what it is / what to do, copy GPS, mark inspected), CSV/PDF export.

**Done.** The page reads in the order the question is asked: one sentence, then the numbers, then the
map, then the patch and the plant. The brief asks this to serve technical and non-technical readers
alike; the answer is not two modes but one order — the plain answer first, its evidence underneath, so
neither reader passes through the other's version. It is also the app specified for a phone, so it is
a single column that widens rather than a dashboard that shrinks.

**The alert sentence is the backend's, not the browser's.** The contract is explicit that it is
assembled from the same snapshot as the figures beside it; a sentence composed here from numbers on
screen can contradict them after a re-fetch. The 14 criticals it names are the 14 in the metric card
because they are one computation.

**Hotspots are derived, and the rule is written down** (`lib/analytics/hotspots.ts`). `GET
/analytics/hotspots` groups in PostGIS; until it answers, the fixture source groups by _same issue,
within 15 m_, so the two can be compared rather than silently diverging. The radius is the finding
worth keeping: B-4 is 16 m wide, so there is no useful way to subdivide a patch across the rows —
someone standing in it can reach every row. At 6 m the 161 findings fell into 66 groups, 32 of them a
single plant: a list of plants wearing the word hotspot. At 15 m they fall into 27, median 4 plants,
6 singletons — a morning's work, ordered worst first.

**Charts.** The `dataviz` skill was read before any chart code. The trend is one series against a
reference line, so no legend — the heading names it — with a hover crosshair, the axis anchored at
zero (this series spans two points of a percent, exactly the shape a truncated baseline flatters into
a cliff, and it is the chart that decides whether someone sprays), and the same numbers published as a
table underneath. Disease bars are two segments with a 2 px gap, a key, and the count printed on every
row. Hand-drawn SVG rather than visx or Recharts: seven points and a rule, on a phone, in a field.

**CSV export is real and works offline** — built in the browser from the rows on screen, which is the
condition it is most wanted in. `source` is a column, so a simulated reading cannot become
indistinguishable from a measured one in a spreadsheet that outlives this session.

**Deviation: no PDF.** The brief says CSV/PDF. Only CSV is in the contract frozen at Phase 1, and the
only client-side route needs a library outside the approved stack. Rather than add one unasked or ship
a button that prints a blank page, the page is laid out to print and the browser's own "Save as PDF"
produces the report. **Open question for Darshan:** if a server-rendered PDF is wanted, it is a new
endpoint and a contract change.

**Stubbed, and visible as such:**

- **No photographs.** `image_url` and `crop_url` are null on every seeded detection — the seed does
  not invent photographs and nothing has uploaded any. The panel says the frame was never stored, and
  draws where in the camera frame the plant sat, captioned as a diagram so it cannot be read as a
  picture of the plant. The bounding box _is_ recorded; the pixels are not.
- **Marking inspected refuses.** That is `POST /detections/{id}/inspections`, which the backend owns.
  Ticking a box that would be gone on reload is worse than saying so.

### Accessibility, measured

Lighthouse accessibility was the outstanding item from Phase 4 and the one acceptance criterion that
had never been run. It now scores **100 on all five pages** — store, Dashboard, Crop Health, Crop Scout
and Mission Planner — against the production build. Getting there found real defects, all of them in
the design system rather than in this phase's code, and all now held by
`packages/ui/src/__tests__/tokens.test.ts`, which parses `tokens.css` and measures every ink-on-fill
pairing the components actually use, in both themes:

- **`SeverityChip` was unreadable.** It wore `on-*` — the ink for the _solid_ severity fill — on the
  _soft_ fill. White on pale pink measured 1.4:1, and all three dark chips about 1.3:1. Chips now use
  ordinary ink; the severity still arrives through the border, the dot and the word.
- **The dark severity scale had collapsed.** The palette validator put dark low and moderate 12.0
  apart in normal vision against a floor of 15, because lifting all three steps compressed the
  lightness range the scale depends on. Re-derived against the dark surface: 17.1 normal, 15.2 deutan,
  every step over 3:1 on its ground.
- **Amber and red as _text_.** `text-moderate` measured 2.5:1 on a card, and red text in dark mode
  fell to 3.2:1 once critical was deepened for mark separation. Marks and words have different jobs
  and different floors, so they now have different tokens: `--color-moderate-ink` and
  `--color-critical-ink`.
- **The `Simulated` badge** was info blue on soft blue at 11 px — 3.46:1, on every page in the product.
- **`ink-subtle` broke this file's own promise**, at 4.32:1 on the page ground; `stale` was printed as
  text at 2.5:1; the store home had no `<main>` landmark; an unreported tank rendered a `role="meter"`
  with no value; and dimming ink with `opacity-80` to suggest secondary importance pushed two labels
  under the floor.

The two lightest severity steps stay below 3:1 against a card — they are the brief's own hex values and
cannot be moved. The test pins that as a deliberate exception, and the mitigation is the one the system
already had: the colour is never the only carrier, and every chart built on them ships a table.

## Phase 9 — ROS 2 bridge 👤

**Owned by Darshan.** Mapping specified in [`docs/contracts/ros2.md`](./contracts/ros2.md).
`rclpy` package, launch file, params, QoS profiles, reconnect, robot-side deadman, `launch_testing` unit tests, and the documented topic mapping made real.

## Phase 10 — Hardening ⬜ ← next

WS fan-out load test, chaos tests (broker restart, network drop mid-teleop), end-to-end OpenTelemetry traces, Lighthouse + Playwright in CI, README runbook.

---

## Tracking against acceptance criteria

| Criterion                                                                                 | Phase that satisfies it                  |
| ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| `make dev` starts the stack, store loads, sim online                                      | 0 (stack) → 4 (store)                    |
| Teleop p95 < 150 ms, stop within 300 ms on tab kill                                       | 3 + 6, measured in 10                    |
| Detections live in Crop Scout, persisted, in Analytics                                    | 3 + 6 + 8                                |
| Snake mission auto-sprays, records `spray_events`, refuses when disarmed/outside geofence | 3 + 7                                    |
| "Simulated" badge on every sim value, driven by `source`                                  | 1 (field) + 4 (badge)                    |
| Backend, frontend unit and Playwright tests in CI                                         | 0 (CI) → each phase adds tests           |
| Lighthouse accessibility ≥ 95                                                             | ✅ measured in 8 — 100 on all five pages |
