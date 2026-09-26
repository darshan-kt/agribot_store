"""Seed the database with one organization, one field, one robot and a week of history.

Run with `make seed` (add `--reset` to wipe and rebuild).

Everything written here carries source='sim'. None of it came from a real sensor, and the
UI badges it accordingly — the seed cannot produce a row that looks like real hardware data.

The numbers are not arbitrary. The week of scouting runs is built so that the state the
product describes is literally true in the database rather than hard-coded in the UI:
late blight spreading through rows 6 to 9, and exactly 14 critical plants outstanding.
"""

import argparse
import asyncio
import random
import uuid
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from agri_api.db import geo
from agri_api.db.enums import (
    CameraSide,
    InspectionStatus,
    MissionMode,
    MissionPattern,
    MissionStatus,
    ScoutRunStatus,
    Severity,
    Source,
    UserRole,
)
from agri_api.db.models import (
    AppInstall,
    Detection,
    Field,
    FieldRow,
    Inspection,
    IssueCatalog,
    Mission,
    MissionWaypoint,
    Organization,
    Robot,
    RobotConfigVersion,
    ScoutRun,
    SensorReading,
    SprayEvent,
    StoreApp,
    Telemetry,
    User,
)
from agri_api.db.seed_data import ISSUE_CATALOG, STORE_APPS
from agri_api.db.session import create_engine, session_scope
from agri_api.logging import configure_logging

log = structlog.get_logger(__name__)

# Deterministic: the same seed produces the same field every time, so a screenshot taken
# today and one taken next week are comparable.
RNG_SEED = 20260925

# --------------------------------------------------------------------- the field --
# Block B-4: a nine-row tomato block. South-west corner, then metric offsets from it.
FIELD_SW_LAT = 51.98400
FIELD_SW_LON = 5.66200
ROW_COUNT = 9
ROW_SPACING_M = 1.5
ROW_LENGTH_M = 100.0
PLANT_SPACING_M = 0.5
PLANTS_PER_ROW = int(ROW_LENGTH_M / PLANT_SPACING_M)
TOTAL_PLANTS = ROW_COUNT * PLANTS_PER_ROW
FIELD_MARGIN_M = 2.0

# ------------------------------------------------------------------- the history --
HISTORY_DAYS = 7
# Where the blight outbreak is, and how bad it has become.
BLIGHT_ROWS = (6, 7, 8, 9)
CRITICAL_TARGET = 14

# Recent telemetry, so the Dashboard has shape without the seed writing millions of rows.
TELEMETRY_PERIOD_S = 5
TELEMETRY_SAMPLES = 1440  # two hours at 0.2 Hz
SENSOR_PERIOD_S = 60
SENSOR_SAMPLES = 60  # one hour at 1/min


def plant_position(row_number: int, along_m: float) -> tuple[float, float]:
    """Latitude/longitude of a plant, given its row and distance from the south edge."""
    east = (row_number - 1) * ROW_SPACING_M
    return geo.offset(FIELD_SW_LAT, FIELD_SW_LON, east_m=east, north_m=along_m)


async def _wipe(session: AsyncSession) -> None:
    """Delete seeded data. Ordered so foreign keys never block a delete."""
    for model in (
        SprayEvent,
        Inspection,
        Detection,
        MissionWaypoint,
        Mission,
        ScoutRun,
        Telemetry,
        SensorReading,
        AppInstall,
        RobotConfigVersion,
        Robot,
        FieldRow,
        Field,
        StoreApp,
        IssueCatalog,
        User,
        Organization,
    ):
        await session.execute(delete(model))
    await session.commit()
    log.info("seed.wiped")


async def _already_seeded(session: AsyncSession) -> bool:
    found = await session.scalar(select(Organization.id).limit(1))
    return found is not None


def _build_field(org_id: uuid.UUID) -> tuple[Field, list[FieldRow]]:
    width = (ROW_COUNT - 1) * ROW_SPACING_M
    corners = [
        geo.offset(FIELD_SW_LAT, FIELD_SW_LON, -FIELD_MARGIN_M, -FIELD_MARGIN_M),
        geo.offset(FIELD_SW_LAT, FIELD_SW_LON, width + FIELD_MARGIN_M, -FIELD_MARGIN_M),
        geo.offset(
            FIELD_SW_LAT, FIELD_SW_LON, width + FIELD_MARGIN_M, ROW_LENGTH_M + FIELD_MARGIN_M
        ),
        geo.offset(FIELD_SW_LAT, FIELD_SW_LON, -FIELD_MARGIN_M, ROW_LENGTH_M + FIELD_MARGIN_M),
    ]
    centre = geo.offset(FIELD_SW_LAT, FIELD_SW_LON, width / 2, ROW_LENGTH_M / 2)
    area_m2 = (width + 2 * FIELD_MARGIN_M) * (ROW_LENGTH_M + 2 * FIELD_MARGIN_M)

    field = Field(
        id=uuid.uuid4(),
        organization_id=org_id,
        name="B-4",
        crop="Tomato",
        row_count=ROW_COUNT,
        area_hectares=round(area_m2 / 10_000, 3),
        boundary=geo.polygon(corners),
        centroid=geo.point(*centre),
    )

    rows = []
    for n in range(1, ROW_COUNT + 1):
        start = plant_position(n, 0.0)
        end = plant_position(n, ROW_LENGTH_M)
        rows.append(
            FieldRow(
                id=uuid.uuid4(),
                field_id=field.id,
                row_number=n,
                path=geo.linestring([start, end]),
                length_m=ROW_LENGTH_M,
                plant_count=PLANTS_PER_ROW,
            )
        )
    return field, rows


def _severity_for(issue_code: str, day_index: int, row: int, rng: random.Random) -> Severity:
    """Severity that reflects how the outbreak actually developed.

    day_index counts backwards: 0 is today, 6 is a week ago. Late blight in the affected
    rows escalates as the week goes on; everything else stays where it started.
    """
    if issue_code == "late_blight" and row in BLIGHT_ROWS:
        age = HISTORY_DAYS - 1 - day_index  # 0 oldest .. 6 today
        if age >= 5:
            return rng.choices([Severity.CRITICAL, Severity.MODERATE], weights=[0.55, 0.45])[0]
        if age >= 3:
            return rng.choices([Severity.MODERATE, Severity.LOW], weights=[0.7, 0.3])[0]
        return Severity.LOW
    if issue_code in {"aphid_colony", "spider_mites"}:
        return rng.choices([Severity.MODERATE, Severity.LOW], weights=[0.3, 0.7])[0]
    return rng.choices([Severity.LOW, Severity.MODERATE], weights=[0.8, 0.2])[0]


def _issue_mix(day_index: int, rng: random.Random) -> list[tuple[str, int]]:
    """How many of each issue a given run found. Blight grows; the rest are steady."""
    age = HISTORY_DAYS - 1 - day_index
    blight = [0, 0, 3, 7, 12, 19, 26][age]
    return [
        ("late_blight", blight),
        ("early_blight", rng.randint(4, 8)),
        ("leaf_mold", rng.randint(1, 4)),
        ("aphid_colony", rng.randint(1, 3)),
        ("spider_mites", rng.randint(0, 2)),
        ("leaf_miner", rng.randint(0, 3)),
    ]


async def seed(session: AsyncSession, *, reset: bool) -> None:
    # Not cryptography: a fixed seed is the point, so the generated field is reproducible.
    rng = random.Random(RNG_SEED)  # noqa: S311
    now = datetime.now(UTC).replace(microsecond=0)

    if await _already_seeded(session):
        if not reset:
            log.warning("seed.skipped", reason="database already seeded; pass --reset to rebuild")
            return
        await _wipe(session)

    # ------------------------------------------------------------ organization --
    org = Organization(id=uuid.uuid4(), name="Green Valley Farms", slug="green-valley")
    session.add(org)

    users = {
        "farmer": User(
            id=uuid.uuid4(),
            organization_id=org.id,
            email="farmer@greenvalley.example",
            display_name="Sam Okafor",
            role=UserRole.FARMER,
            password_hash=None,
        ),
        "operator": User(
            id=uuid.uuid4(),
            organization_id=org.id,
            email="operator@greenvalley.example",
            display_name="Priya Raman",
            role=UserRole.OPERATOR,
            password_hash=None,
        ),
        "admin": User(
            id=uuid.uuid4(),
            organization_id=org.id,
            email="admin@greenvalley.example",
            display_name="Jordan Lee",
            role=UserRole.ADMIN,
            password_hash=None,
        ),
    }
    session.add_all(users.values())

    # password_hash is left null on purpose: the seed must not create sign-in
    # credentials. Authentication is wired up with the backend.

    # -------------------------------------------------------------------- field --
    field, rows = _build_field(org.id)
    session.add(field)
    session.add_all(rows)

    # -------------------------------------------------------------------- robot --
    robot = Robot(
        id=uuid.uuid4(),
        organization_id=org.id,
        robot_id="scout-01",
        name="Scout-01",
        model="AgriScout R2",
        firmware="2.4.1",
        serial="ASR2-0041",
        online=True,
        last_seen_at=now,
        mode="idle",
        estop_engaged=False,
        # Overwritten below from the last telemetry sample, so the figure on the
        # robot row and the one on its battery chart can never disagree.
        battery_percent=None,
        current_field_id=field.id,
        current_row=7,
        active_config_version=1,
    )
    session.add(robot)
    session.add(
        RobotConfigVersion(
            id=uuid.uuid4(),
            robot_id=robot.id,
            version=1,
            max_speed_mps=0.8,
            detection_sensitivity=0.65,
            return_to_base_battery_percent=20,
            camera_fps=15,
            obstacle_stop_enabled=True,
            created_by=users["admin"].id,
            acked_at=now - timedelta(days=9),
        )
    )

    # ------------------------------------------------------------- store catalog --
    apps = [StoreApp(id=uuid.uuid4(), **spec) for spec in STORE_APPS]
    session.add_all(apps)
    session.add_all(
        AppInstall(
            id=uuid.uuid4(),
            app_id=app.id,
            organization_id=org.id,
            robot_id=robot.id,
            enabled=True,
        )
        for app in apps
    )

    # ------------------------------------------------------------ issue catalog --
    issues = {spec["code"]: IssueCatalog(id=uuid.uuid4(), **spec) for spec in ISSUE_CATALOG}
    session.add_all(issues.values())

    await session.flush()

    # --------------------------------------------------- a week of scouting runs --
    all_detections: list[Detection] = []
    runs: list[ScoutRun] = []

    for day_index in range(HISTORY_DAYS):
        started = (now - timedelta(days=day_index)).replace(hour=7, minute=10, second=0)
        duration = timedelta(minutes=rng.randint(38, 52))
        mix = _issue_mix(day_index, rng)
        flagged = sum(count for _, count in mix)

        run = ScoutRun(
            id=uuid.uuid4(),
            robot_id=robot.id,
            field_id=field.id,
            mission_id=None,
            status=ScoutRunStatus.COMPLETED,
            started_at=started,
            ended_at=started + duration,
            plants_scanned=TOTAL_PLANTS,
            plants_flagged=flagged,
            distance_m=round(ROW_COUNT * ROW_LENGTH_M + (ROW_COUNT - 1) * ROW_SPACING_M, 2),
            source=Source.SIM,
        )
        runs.append(run)

        for issue_code, count in mix:
            for _ in range(count):
                row = (
                    rng.choice(BLIGHT_ROWS)
                    if issue_code == "late_blight"
                    else rng.randint(1, ROW_COUNT)
                )
                along = round(rng.uniform(2.0, ROW_LENGTH_M - 2.0), 2)
                lat, lon = plant_position(row, along)
                severity = _severity_for(issue_code, day_index, row, rng)
                detected = started + timedelta(
                    seconds=int(duration.total_seconds() * (along / ROW_LENGTH_M))
                )
                box_w = round(rng.uniform(0.08, 0.22), 5)
                box_h = round(rng.uniform(0.10, 0.26), 5)
                all_detections.append(
                    Detection(
                        id=uuid.uuid4(),
                        detection_uid=uuid.uuid4(),
                        robot_id=robot.id,
                        run_id=run.id,
                        field_id=field.id,
                        issue_id=issues[issue_code].id,
                        detected_at=detected,
                        severity=severity,
                        confidence=round(rng.uniform(0.61, 0.97), 3),
                        camera=rng.choice([CameraSide.LEFT, CameraSide.RIGHT]),
                        bbox_x=round(rng.uniform(0.05, 1 - box_w - 0.05), 5),
                        bbox_y=round(rng.uniform(0.05, 1 - box_h - 0.05), 5),
                        bbox_w=box_w,
                        bbox_h=box_h,
                        location=geo.point(lat, lon),
                        row=row,
                        metres_from_edge=along,
                        # No image: the seed does not invent photographs. The UI shows its
                        # "image not uploaded" state until a real run produces one.
                        image_key=None,
                        crop_key=None,
                        source=Source.SIM,
                    )
                )

    session.add_all(runs)
    session.add_all(all_detections)
    await session.flush()
    log.info("seed.detections", runs=len(runs), detections=len(all_detections))

    # ---------------------------------------------- pin the outstanding critical count --
    # The product says "check the 14 critical plants". Rather than hard-coding 14 in the
    # UI, the most recent run is normalised so the database actually contains 14 critical
    # findings — the interface then simply counts them.
    todays_run = runs[0]
    todays = [d for d in all_detections if d.run_id == todays_run.id]
    criticals = [d for d in todays if d.severity is Severity.CRITICAL]

    if len(criticals) > CRITICAL_TARGET:
        for detection in criticals[CRITICAL_TARGET:]:
            detection.severity = Severity.MODERATE
    elif len(criticals) < CRITICAL_TARGET:
        shortfall = CRITICAL_TARGET - len(criticals)
        candidates = [
            d
            for d in todays
            if d.severity is Severity.MODERATE
            and d.issue_id == issues["late_blight"].id
            and d.row in BLIGHT_ROWS
        ]
        for detection in candidates[:shortfall]:
            detection.severity = Severity.CRITICAL

    # ----------------------------------------------------------------- inspections --
    # A handful of older findings have already been dealt with. Today's criticals are
    # deliberately left untouched: they are the outstanding work the UI is pointing at.
    older = [d for d in all_detections if d.run_id != todays_run.id]
    for detection in rng.sample(older, k=min(18, len(older))):
        status = rng.choices(
            [InspectionStatus.CONFIRMED, InspectionStatus.TREATED, InspectionStatus.FALSE_POSITIVE],
            weights=[0.35, 0.45, 0.20],
        )[0]
        session.add(
            Inspection(
                id=uuid.uuid4(),
                detection_id=detection.id,
                user_id=users["farmer"].id,
                status=status,
                note=(
                    "Checked on the morning walk."
                    if status is InspectionStatus.CONFIRMED
                    else "Sprayed and tagged."
                    if status is InspectionStatus.TREATED
                    else "Looked like blight from the camera, it was soil splash."
                ),
            )
        )

    # -------------------------------------------------------------------- missions --
    snake_started = now - timedelta(days=1, hours=2)
    snake = Mission(
        id=uuid.uuid4(),
        robot_id=robot.id,
        field_id=field.id,
        created_by=users["operator"].id,
        name="B-4 full coverage",
        mode=MissionMode.AUTONOMOUS,
        pattern=MissionPattern.SNAKE,
        status=MissionStatus.COMPLETED,
        speed_mps=0.8,
        auto_spray=True,
        started_at=snake_started,
        ended_at=snake_started + timedelta(minutes=47),
        distance_travelled_m=round(ROW_COUNT * ROW_LENGTH_M, 2),
    )
    session.add(snake)

    # A snake pattern: up one row, across, back down the next.
    seq = 0
    for index, row_number in enumerate(range(1, ROW_COUNT + 1)):
        legs = [0.0, ROW_LENGTH_M] if index % 2 == 0 else [ROW_LENGTH_M, 0.0]
        for along in legs:
            lat, lon = plant_position(row_number, along)
            session.add(
                MissionWaypoint(
                    id=uuid.uuid4(),
                    mission_id=snake.id,
                    seq=seq,
                    location=geo.point(lat, lon),
                    heading_deg=0.0 if index % 2 == 0 else 180.0,
                    reached_at=snake_started + timedelta(minutes=round(seq * 2.6)),
                )
            )
            seq += 1

    manual = Mission(
        id=uuid.uuid4(),
        robot_id=robot.id,
        field_id=field.id,
        created_by=users["operator"].id,
        name="Row 7 spot check",
        mode=MissionMode.REMOTE_CONTROL,
        pattern=None,
        status=MissionStatus.COMPLETED,
        speed_mps=0.4,
        auto_spray=False,
        started_at=now - timedelta(hours=5),
        ended_at=now - timedelta(hours=4, minutes=38),
        distance_travelled_m=86.4,
    )
    session.add(manual)

    # ----------------------------------------------------------------- spray events --
    # Auto-sprays from the snake mission, each tied to the plant it treated.
    treated = [
        d
        for d in all_detections
        if d.run_id == runs[1].id and d.severity in (Severity.CRITICAL, Severity.MODERATE)
    ][:11]
    for index, detection in enumerate(treated):
        lat, lon = plant_position(detection.row or 1, float(detection.metres_from_edge or 0))
        duration_ms = rng.randint(900, 1800)
        flow = 1.8
        session.add(
            SprayEvent(
                id=uuid.uuid4(),
                robot_id=robot.id,
                mission_id=snake.id,
                field_id=field.id,
                detection_id=detection.id,
                triggered_by=None,
                sprayed_at=snake_started + timedelta(minutes=3 + index * 4),
                location=geo.point(lat, lon),
                duration_ms=duration_ms,
                flow_lpm=flow,
                arc_deg=180,
                nozzle_height_cm=45.0,
                litres=round(flow * duration_ms / 60_000, 3),
                auto=True,
                source=Source.SIM,
            )
        )

    # ------------------------------------------------- telemetry and sensor history --
    # Two hours at 0.2 Hz: enough for the Dashboard trends to have shape without writing
    # a million rows into a seed.
    battery = 92.0
    for step in range(TELEMETRY_SAMPLES):
        at = now - timedelta(seconds=(TELEMETRY_SAMPLES - step) * TELEMETRY_PERIOD_S)
        # ~14% over two hours of scouting, which is the realistic draw for this
        # platform. The earlier rate drained a full pack in one window.
        battery = max(5.0, battery - rng.uniform(0.005, 0.014))
        moving = step % 40 < 28
        session.add(
            Telemetry(
                time=at,
                robot_id=robot.id,
                battery_percent=round(battery, 2),
                battery_time_remaining_s=int(battery / 100 * 5.5 * 3600),
                battery_voltage_v=round(46.0 + battery * 0.04, 2),
                signal_dbm=round(rng.uniform(-71, -54), 1),
                uptime_s=step * TELEMETRY_PERIOD_S + 900,
                speed_mps=round(rng.uniform(0.55, 0.82), 2) if moving else 0.0,
                cpu_percent=round(rng.uniform(34, 61) if moving else rng.uniform(8, 18), 2),
                gpu_percent=round(rng.uniform(58, 84) if moving else rng.uniform(4, 11), 2),
                memory_percent=round(rng.uniform(41, 57), 2),
                cpu_temp_c=round(rng.uniform(52, 67), 2),
                gpu_temp_c=round(rng.uniform(58, 74), 2),
                detection_fps=round(rng.uniform(11.5, 15.0) if moving else 0.0, 2),
                storage_used_gb=round(214 + step * 0.02, 2),
                source=Source.SIM,
            )
        )

    # The most recent sensor snapshot. Humidity is high after the rain, which is both why
    # the blight is spreading and why the Dashboard shows one sensor needing a check.
    sensor_snapshots: list[tuple[str, str, dict[str, object]]] = [
        ("camera_left", "ok", {"width": 1920, "height": 1080, "fps": 15.0, "dropped_frames": 2}),
        ("camera_right", "ok", {"width": 1920, "height": 1080, "fps": 15.0, "dropped_frames": 0}),
        ("gps", "ok", {"fix_type": "rtk_fixed", "accuracy_m": 0.021, "satellites": 19}),
        ("imu", "ok", {"roll_deg": 0.8, "pitch_deg": -1.4, "yaw_deg": 3.2}),
        ("lidar", "ok", {"nearest_obstacle_m": 4.6, "bearing_deg": 12.0, "range_max_m": 12.0}),
        (
            "weather",
            "check",
            {
                "temperature_c": 21.4,
                "humidity_percent": 88.0,
                "warnings": ["high_humidity_blight_risk"],
            },
        ),
        (
            "encoders",
            "ok",
            {"left_rpm": 0.0, "right_rpm": 0.0, "left_ticks": 8814422, "right_ticks": 8813977},
        ),
    ]
    for offset_steps in range(SENSOR_SAMPLES):
        at = now - timedelta(seconds=(SENSOR_SAMPLES - offset_steps) * SENSOR_PERIOD_S)
        for name, sensor_status, readings in sensor_snapshots:
            session.add(
                SensorReading(
                    time=at,
                    robot_id=robot.id,
                    sensor=name,
                    status=sensor_status,
                    readings=readings,
                    source=Source.SIM,
                )
            )

    # The robot's cached battery is the last telemetry reading, not a separate guess.
    robot.battery_percent = round(battery, 2)

    await session.commit()

    critical_now = sum(
        1 for d in all_detections if d.run_id == todays_run.id and d.severity is Severity.CRITICAL
    )
    log.info(
        "seed.done",
        organization=org.slug,
        field=field.name,
        rows=ROW_COUNT,
        robot=robot.robot_id,
        apps=len(apps),
        issues=len(issues),
        scout_runs=len(runs),
        detections=len(all_detections),
        critical_outstanding=critical_now,
        telemetry_rows=TELEMETRY_SAMPLES,
        sensor_rows=SENSOR_SAMPLES * len(sensor_snapshots),
    )


async def refresh_aggregates() -> None:
    """Materialise the rollups over the rows the seed just wrote.

    telemetry_1min was created WITH NO DATA and its refresh policy would not run for
    another minute, so without this the Dashboard's first read returns an empty series.
    Neither statement may run inside a transaction, so this takes its own AUTOCOMMIT
    connection rather than reusing the seed's session.
    """
    engine = create_engine()
    try:
        async with engine.connect() as conn:
            await conn.execution_options(isolation_level="AUTOCOMMIT")
            await conn.exec_driver_sql(
                "CALL refresh_continuous_aggregate('telemetry_1min', NULL, NULL);"
            )
            await conn.exec_driver_sql("REFRESH MATERIALIZED VIEW detections_daily;")
    finally:
        await engine.dispose()
    log.info("seed.aggregates_refreshed")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete existing seeded data first (destructive)",
    )
    args = parser.parse_args()

    configure_logging("INFO")
    async with session_scope() as session:
        await seed(session, reset=args.reset)
    await refresh_aggregates()


if __name__ == "__main__":
    asyncio.run(main())
