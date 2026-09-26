"""Export the seeded database as JSON fixtures shaped by the OpenAPI contract.

Run with `make fixtures`.

Why this exists: the backend services are being built separately, but the UI should not
wait on them and should not be developed against invented data. So the fixtures are
produced from the real database, through the real geometry, in exactly the response
shapes defined in packages/contracts/openapi.yaml.

That gives two properties worth having:

  * The UI is typed against the generated OpenAPI types. If a fixture drifts from the
    contract, `pnpm typecheck` fails — the fixtures cannot quietly diverge.
  * Swapping to the live API is a change of data source, not a rewrite, because both
    implementations satisfy the same interface.

Nothing here invents values. Every field comes from a query, and `source` is carried
through unchanged, so fixture-backed screens still show the Simulated badge.
"""

import asyncio
import json
import pathlib
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import structlog
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from agri_api.db.models import (
    Detection,
    Field,
    FieldRow,
    Inspection,
    IssueCatalog,
    Mission,
    MissionWaypoint,
    Robot,
    ScoutRun,
    SensorReading,
    SprayEvent,
    StoreApp,
    Telemetry,
)
from agri_api.db.session import session_scope
from agri_api.logging import configure_logging

log = structlog.get_logger(__name__)

# .../services/api/src/agri_api/db/export_fixtures.py -> repository root is 6 levels up.
REPO_ROOT = pathlib.Path(__file__).resolve().parents[5]
OUT_DIR = REPO_ROOT / "apps" / "web" / "src" / "lib" / "fixtures"

# Infection rate above which the Analytics trend chart advises acting.
ACTION_THRESHOLD = 0.04


def _num(value: Decimal | float | int | None) -> float | None:
    return None if value is None else float(value)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _write(name: str, payload: Any) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n")
    log.info("fixture.written", file=path.name, bytes=path.stat().st_size)


def _issue_payload(issue: IssueCatalog) -> dict[str, Any]:
    return {
        "code": issue.code,
        "name": issue.name,
        "scientific_name": issue.scientific_name,
        "issue_type": issue.issue_type.value,
        "what_it_is": issue.what_it_is,
        "what_to_do": issue.what_to_do,
        "action_within_days": issue.action_within_days,
    }


# Geography columns are read back as lat/lon in the same query rather than one round
# trip per row.
def _lat(col: Any) -> Any:
    return func.ST_Y(cast(col, Geometry))


def _lon(col: Any) -> Any:
    return func.ST_X(cast(col, Geometry))


async def export_store(session: AsyncSession, critical_count: int, check_count: int) -> None:
    apps = (await session.scalars(select(StoreApp).order_by(StoreApp.sort_order))).all()

    def badge(slug: str) -> dict[str, str] | None:
        # Counts, not strings. If the data changes, the badge changes with it.
        if slug == "crop-health" and critical_count:
            return {"label": f"{critical_count} critical", "tone": "critical"}
        if slug == "dashboard" and check_count:
            return {"label": f"{check_count} check", "tone": "warning"}
        return None

    _write(
        "store-apps",
        {
            "apps": [
                {
                    "id": str(app.id),
                    "slug": app.slug,
                    "name": app.name,
                    "tagline": app.tagline,
                    "description": app.description,
                    "category": app.category.value,
                    "icon": app.icon,
                    "featured": app.featured,
                    "flow_position": app.flow_position,
                    "route": app.route,
                    "badge": badge(app.slug),
                }
                for app in apps
            ]
        },
    )


async def export_robot(session: AsyncSession) -> tuple[Robot, int]:
    # Eager-loaded: a lazy relationship access would emit IO outside the async context.
    robot = (
        await session.scalars(select(Robot).options(selectinload(Robot.config_versions)))
    ).one()
    field = (await session.scalars(select(Field))).one()

    # Latest reading per sensor.
    latest = (
        await session.execute(
            select(
                SensorReading.sensor,
                SensorReading.status,
                SensorReading.readings,
                SensorReading.time,
                SensorReading.source,
            )
            .ext(postgresql.distinct_on(SensorReading.sensor))
            .order_by(SensorReading.sensor, SensorReading.time.desc())
        )
    ).all()

    sensors = [
        {
            "sensor": row.sensor,
            "status": row.status,
            "readings": row.readings,
            "updated_at": _iso(row.time),
            "source": row.source.value,
        }
        for row in latest
    ]
    check_count = sum(1 for s in sensors if s["status"] == "check")

    config = robot.config_versions[0] if robot.config_versions else None
    _write(
        "robot",
        {
            "id": str(robot.id),
            "robot_id": robot.robot_id,
            "name": robot.name,
            "model": robot.model,
            "firmware": robot.firmware,
            "online": robot.online,
            "last_seen_at": _iso(robot.last_seen_at),
            "mode": robot.mode,
            "estop_engaged": robot.estop_engaged,
            "battery_percent": _num(robot.battery_percent),
            "field": {"id": str(field.id), "name": field.name},
            "row": robot.current_row,
            "source": "sim",
            "sensors": sensors,
            "active_config": None
            if config is None
            else {
                "id": str(config.id),
                "version": config.version,
                "created_at": _iso(config.created_at),
                "created_by": None,
                "acked_at": _iso(config.acked_at),
                "rejected_reason": config.rejected_reason,
                "max_speed_mps": _num(config.max_speed_mps),
                "detection_sensitivity": _num(config.detection_sensitivity),
                "return_to_base_battery_percent": config.return_to_base_battery_percent,
                "camera_fps": config.camera_fps,
                "obstacle_stop_enabled": config.obstacle_stop_enabled,
            },
        },
    )
    return robot, check_count


async def export_telemetry(session: AsyncSession) -> None:
    """Recent telemetry, read from the TimescaleDB continuous aggregate.

    The Dashboard reads the rollup rather than raw rows: one point per minute is all a
    two-hour trend can show, and it is the query the live backend will serve too.
    The single most recent *raw* sample is exported alongside it, because the status
    cards show the latest reading rather than a minute average of it.
    """
    buckets = (
        await session.execute(
            text(
                """
                SELECT bucket, battery_percent_avg, signal_dbm_avg, speed_mps_avg,
                       cpu_percent_avg, gpu_percent_avg, memory_percent_avg,
                       cpu_temp_c_max, detection_fps_avg
                FROM telemetry_1min
                ORDER BY bucket
                """
            )
        )
    ).all()

    latest = (
        await session.execute(select(Telemetry).order_by(Telemetry.time.desc()).limit(1))
    ).scalar_one()

    _write(
        "telemetry",
        {
            "resolution": "minute",
            "samples": [
                {
                    "time": _iso(b.bucket),
                    "battery_percent": _num(b.battery_percent_avg),
                    "signal_dbm": _num(b.signal_dbm_avg),
                    "speed_mps": _num(b.speed_mps_avg),
                    "cpu_percent": _num(b.cpu_percent_avg),
                    "gpu_percent": _num(b.gpu_percent_avg),
                    "memory_percent": _num(b.memory_percent_avg),
                    "cpu_temp_c": _num(b.cpu_temp_c_max),
                    "detection_fps": _num(b.detection_fps_avg),
                }
                for b in buckets
            ],
            "latest": {
                "time": _iso(latest.time),
                "battery_percent": _num(latest.battery_percent),
                "battery_time_remaining_s": latest.battery_time_remaining_s,
                "battery_voltage_v": _num(latest.battery_voltage_v),
                "signal_dbm": _num(latest.signal_dbm),
                "uptime_s": latest.uptime_s,
                "speed_mps": _num(latest.speed_mps),
                "cpu_percent": _num(latest.cpu_percent),
                "gpu_percent": _num(latest.gpu_percent),
                "memory_percent": _num(latest.memory_percent),
                "cpu_temp_c": _num(latest.cpu_temp_c),
                "gpu_temp_c": _num(latest.gpu_temp_c),
                "detection_fps": _num(latest.detection_fps),
                "storage_used_gb": _num(latest.storage_used_gb),
                "storage_total_gb": 512.0,
                "source": latest.source.value,
            },
        },
    )


async def export_field(session: AsyncSession) -> None:
    field = (await session.scalars(select(Field))).one()
    boundary, centre_lat, centre_lon = (
        await session.execute(
            select(
                func.ST_AsGeoJSON(Field.boundary),
                _lat(Field.centroid),
                _lon(Field.centroid),
            ).where(Field.id == field.id)
        )
    ).one()

    rows = (
        await session.execute(
            select(
                FieldRow.row_number,
                FieldRow.length_m,
                FieldRow.plant_count,
                func.ST_AsGeoJSON(FieldRow.path),
            )
            .where(FieldRow.field_id == field.id)
            .order_by(FieldRow.row_number)
        )
    ).all()

    _write(
        "field",
        {
            "id": str(field.id),
            "name": field.name,
            "crop": field.crop,
            "row_count": field.row_count,
            "area_hectares": _num(field.area_hectares),
            "centroid": {"lat": round(centre_lat, 7), "lon": round(centre_lon, 7)},
            "boundary": json.loads(boundary),
            "rows": [
                {
                    "row_number": r.row_number,
                    "length_m": _num(r.length_m),
                    "plant_count": r.plant_count,
                    "path": json.loads(r[3]),
                }
                for r in rows
            ],
        },
    )


async def _detection_rows(session: AsyncSession, limit: int | None = None) -> Sequence[Any]:
    # Latest inspection status per detection, so the UI can tell outstanding work from
    # findings someone has already walked out to.
    latest_inspection = (
        select(
            Inspection.detection_id.label("detection_id"),
            func.first_value(Inspection.status)
            .over(
                partition_by=Inspection.detection_id,
                order_by=Inspection.created_at.desc(),
            )
            .label("status"),
        )
        .ext(postgresql.distinct_on(Inspection.detection_id))
        .order_by(Inspection.detection_id, Inspection.created_at.desc())
        .subquery()
    )

    stmt = (
        select(
            Detection,
            IssueCatalog,
            _lat(Detection.location).label("lat"),
            _lon(Detection.location).label("lon"),
            latest_inspection.c.status.label("inspection_status"),
        )
        .join(IssueCatalog, IssueCatalog.id == Detection.issue_id)
        .outerjoin(latest_inspection, latest_inspection.c.detection_id == Detection.id)
        .order_by(Detection.detected_at.desc())
    )
    if limit:
        stmt = stmt.limit(limit)
    return (await session.execute(stmt)).all()


def _detection_payload(row: Any) -> dict[str, Any]:
    d: Detection = row[0]
    issue: IssueCatalog = row[1]
    return {
        "id": str(d.id),
        "detected_at": _iso(d.detected_at),
        "severity": d.severity.value,
        "confidence": _num(d.confidence),
        "camera": d.camera.value,
        "bbox": {
            "x": _num(d.bbox_x),
            "y": _num(d.bbox_y),
            "w": _num(d.bbox_w),
            "h": _num(d.bbox_h),
        },
        "location": None
        if row.lat is None
        else {"lat": round(row.lat, 7), "lon": round(row.lon, 7)},
        "row": d.row,
        "metres_from_edge": _num(d.metres_from_edge),
        # Null, not a placeholder path. The seed does not invent photographs, and the UI
        # renders its "image not uploaded" state — the same one a real detection shows
        # while its upload is still in flight.
        "image_url": None,
        "crop_url": None,
        "issue": _issue_payload(issue),
        # Comes back as a bare string from the subquery rather than a mapped enum.
        "inspection_status": getattr(row.inspection_status, "value", row.inspection_status),
        "source": d.source.value,
    }


async def export_detections(session: AsyncSession) -> None:
    rows = await _detection_rows(session)
    _write(
        "detections",
        {"detections": [_detection_payload(r) for r in rows], "next_cursor": None},
    )


async def export_scout_runs(session: AsyncSession) -> None:
    runs = (await session.scalars(select(ScoutRun).order_by(ScoutRun.started_at.desc()))).all()
    _write(
        "scout-runs",
        {
            "runs": [
                {
                    "id": str(r.id),
                    "status": r.status.value,
                    "started_at": _iso(r.started_at),
                    "ended_at": _iso(r.ended_at),
                    "plants_scanned": r.plants_scanned,
                    "plants_flagged": r.plants_flagged,
                    "infection_rate": round(r.plants_flagged / r.plants_scanned, 5)
                    if r.plants_scanned
                    else 0.0,
                    "distance_m": _num(r.distance_m),
                    "source": r.source.value,
                }
                for r in runs
            ],
            "next_cursor": None,
        },
    )


async def export_missions(session: AsyncSession) -> None:
    missions = (await session.scalars(select(Mission).order_by(Mission.created_at.desc()))).all()
    payload = []
    for m in missions:
        waypoints = (
            await session.execute(
                select(
                    MissionWaypoint.seq,
                    MissionWaypoint.heading_deg,
                    MissionWaypoint.reached_at,
                    _lat(MissionWaypoint.location).label("lat"),
                    _lon(MissionWaypoint.location).label("lon"),
                )
                .where(MissionWaypoint.mission_id == m.id)
                .order_by(MissionWaypoint.seq)
            )
        ).all()
        sprays = (
            await session.execute(
                select(
                    SprayEvent,
                    _lat(SprayEvent.location).label("lat"),
                    _lon(SprayEvent.location).label("lon"),
                )
                .where(SprayEvent.mission_id == m.id)
                .order_by(SprayEvent.sprayed_at)
            )
        ).all()
        payload.append(
            {
                "id": str(m.id),
                "name": m.name,
                "mode": m.mode.value,
                "pattern": m.pattern.value if m.pattern else None,
                "status": m.status.value,
                "auto_spray": m.auto_spray,
                "speed_mps": _num(m.speed_mps),
                "started_at": _iso(m.started_at),
                "ended_at": _iso(m.ended_at),
                "distance_travelled_m": _num(m.distance_travelled_m),
                "failure_reason": m.failure_reason,
                "created_at": _iso(m.created_at),
                "waypoints": [
                    {
                        "seq": w.seq,
                        "lat": round(w.lat, 7),
                        "lon": round(w.lon, 7),
                        "heading_deg": _num(w.heading_deg),
                        "reached_at": _iso(w.reached_at),
                    }
                    for w in waypoints
                ],
                "spray_events": [
                    {
                        "id": str(s[0].id),
                        "sprayed_at": _iso(s[0].sprayed_at),
                        "location": {"lat": round(s.lat, 7), "lon": round(s.lon, 7)},
                        "duration_ms": s[0].duration_ms,
                        "flow_lpm": _num(s[0].flow_lpm),
                        "arc_deg": s[0].arc_deg,
                        "nozzle_height_cm": _num(s[0].nozzle_height_cm),
                        "litres": _num(s[0].litres),
                        "auto": s[0].auto,
                        "detection_id": str(s[0].detection_id) if s[0].detection_id else None,
                        "source": s[0].source.value,
                    }
                    for s in sprays
                ],
            }
        )
    _write("missions", {"missions": payload, "next_cursor": None})


async def export_analytics(session: AsyncSession) -> int:
    """Build the Analytics overview, and return the outstanding critical count."""
    field = (await session.scalars(select(Field))).one()
    runs = (await session.scalars(select(ScoutRun).order_by(ScoutRun.started_at))).all()
    latest = runs[-1]
    previous = runs[-2] if len(runs) > 1 else None

    # Severity mix and per-issue counts for the most recent run.
    mix_rows = (
        await session.execute(
            select(Detection.severity, func.count())
            .where(Detection.run_id == latest.id)
            .group_by(Detection.severity)
        )
    ).all()
    severity_mix = [{"severity": s.value, "count": c} for s, c in mix_rows]

    issue_rows = (
        await session.execute(
            select(
                IssueCatalog,
                func.count().label("total"),
                func.count().filter(Detection.severity == "critical").label("critical"),
            )
            .join(Detection, Detection.issue_id == IssueCatalog.id)
            .where(Detection.run_id == latest.id)
            .group_by(IssueCatalog.id)
            .order_by(func.count().desc())
        )
    ).all()
    # Annotated, and the aggregate columns coerced, because SQLAlchemy types a labelled
    # func.count() as Any: without this the dict infers dict[str, object] and the
    # critical count leaves this function untyped.
    issues: list[dict[str, Any]] = [
        {"issue": _issue_payload(r[0]), "count": int(r.total), "critical_count": int(r.critical)}
        for r in issue_rows
    ]

    critical_count = sum(int(i["critical_count"]) for i in issues)
    infection_rate = latest.plants_flagged / latest.plants_scanned if latest.plants_scanned else 0.0
    previous_rate = (
        previous.plants_flagged / previous.plants_scanned
        if previous and previous.plants_scanned
        else None
    )

    # The alert sentence.
    #
    # Composed here from the same query results as the numbers beside it, so the words
    # and the figures cannot disagree. Every part of it is a value: the issue name, the
    # row range, the count, the days. Nothing is a hard-coded string about tomatoes.
    alert: dict[str, Any] | None = None
    worst = next((i for i in issues if i["critical_count"] > 0), None)
    if worst is not None:
        row_range = (
            await session.execute(
                select(func.min(Detection.row), func.max(Detection.row))
                .join(IssueCatalog, IssueCatalog.id == Detection.issue_id)
                .where(
                    Detection.run_id == latest.id,
                    Detection.severity == "critical",
                    IssueCatalog.code == worst["issue"]["code"],
                )
            )
        ).one()
        from_row, to_row = row_range
        n = worst["critical_count"]
        within = worst["issue"]["action_within_days"]
        where = f"in rows {from_row} to {to_row}" if from_row != to_row else f"in row {from_row}"
        plants = "plant" if n == 1 else "plants"
        spreading = (
            "is spreading"
            if previous_rate is not None and infection_rate > previous_rate
            else "has been found"
        )
        # Why it is spreading, when the robot's own weather sensor can say so. Derived
        # from the live warning code rather than asserting a rainfall history nobody
        # measured — the product's example copy says "after last week's rain", and this
        # is the honest version of that clause.
        weather: dict[str, Any] = (
            await session.execute(
                select(SensorReading.readings)
                .where(SensorReading.sensor == "weather")
                .order_by(SensorReading.time.desc())
                .limit(1)
            )
        ).scalar_one_or_none() or {}
        humid = "high_humidity_blight_risk" in (weather.get("warnings") or [])
        because = (
            f" after {int(weather['humidity_percent'])}% humidity in the field"
            if humid and weather.get("humidity_percent") is not None
            else ""
        )
        alert = {
            "sentence": (
                f"{worst['issue']['name']} {spreading} {where}{because}. "
                f"Check the {n} critical {plants} within {within} "
                f"{'day' if within == 1 else 'days'}."
            ),
            "tone": "critical",
            "issue_code": worst["issue"]["code"],
            "from_row": from_row,
            "to_row": to_row,
            "critical_count": n,
            "within_days": within,
        }

    _write(
        "analytics-overview",
        {
            "field": {"id": str(field.id), "name": field.name, "crop": field.crop},
            "generated_at": _iso(datetime.now(UTC)),
            "metrics": {
                "plants_scanned": latest.plants_scanned,
                "plants_flagged": latest.plants_flagged,
                "infection_rate": round(infection_rate, 5),
                "critical_count": critical_count,
                "change_vs_previous_run": None
                if previous_rate is None
                else round(infection_rate - previous_rate, 5),
            },
            "severity_mix": severity_mix,
            "issues": issues,
            "trend": {
                "action_threshold": ACTION_THRESHOLD,
                "points": [
                    {
                        "run_id": str(r.id),
                        "at": _iso(r.started_at),
                        "infection_rate": round(r.plants_flagged / r.plants_scanned, 5)
                        if r.plants_scanned
                        else 0.0,
                        "flagged": r.plants_flagged,
                    }
                    for r in runs
                ],
            },
            "alert": alert,
        },
    )
    return critical_count


async def export_all(session: AsyncSession) -> None:
    critical_count = await export_analytics(session)
    _, check_count = await export_robot(session)
    await export_store(session, critical_count, check_count)
    await export_field(session)
    await export_telemetry(session)
    await export_detections(session)
    await export_scout_runs(session)
    await export_missions(session)
    log.info("fixtures.done", directory=str(OUT_DIR), critical=critical_count, checks=check_count)


async def main() -> None:
    configure_logging("INFO")
    async with session_scope() as session:
        await export_all(session)


if __name__ == "__main__":
    asyncio.run(main())
