"""Time-series tables, converted to TimescaleDB hypertables by the migration.

Two things differ from the rest of the schema:

1. There is no UUID primary key. A hypertable's primary key must include the time
   column, so the key is (time, robot_id) — which is also the access pattern: "this
   robot, this window".
2. Retention and continuous aggregates are declared in the migration, not here, because
   SQLAlchemy has no concept of either.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from agri_api.db.base import Base
from agri_api.db.enums import Source, pg_enum


class Telemetry(Base):
    """1-10 Hz robot vitals. Hypertable, 30-day retention, 1-minute continuous aggregate."""

    __tablename__ = "telemetry"
    __table_args__ = (Index("ix_telemetry_robot_id_time", "robot_id", "time"),)

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    robot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("robots.id", ondelete="CASCADE"), primary_key=True
    )

    battery_percent: Mapped[float | None] = mapped_column(Numeric(5, 2))
    battery_time_remaining_s: Mapped[int | None] = mapped_column(Integer)
    battery_voltage_v: Mapped[float | None] = mapped_column(Numeric(5, 2))
    signal_dbm: Mapped[float | None] = mapped_column(Numeric(5, 1))
    uptime_s: Mapped[int | None] = mapped_column(Integer)
    speed_mps: Mapped[float | None] = mapped_column(Numeric(5, 2))

    cpu_percent: Mapped[float | None] = mapped_column(Numeric(5, 2))
    gpu_percent: Mapped[float | None] = mapped_column(Numeric(5, 2))
    memory_percent: Mapped[float | None] = mapped_column(Numeric(5, 2))
    cpu_temp_c: Mapped[float | None] = mapped_column(Numeric(5, 2))
    gpu_temp_c: Mapped[float | None] = mapped_column(Numeric(5, 2))
    detection_fps: Mapped[float | None] = mapped_column(Numeric(5, 2))
    storage_used_gb: Mapped[float | None] = mapped_column(Numeric(8, 2))

    source: Mapped[Source] = mapped_column(
        pg_enum(Source, "source", create_type=False), nullable=False
    )


class SensorReading(Base):
    """1 Hz per-sensor readings. Hypertable, 14-day retention.

    Readings are stored as JSONB rather than a column per sensor field: sensors differ
    per robot model, and adding a lidar variant should not be a migration over a table
    with hundreds of millions of rows.
    """

    __tablename__ = "sensor_readings"
    __table_args__ = (
        Index("ix_sensor_readings_robot_id_sensor_time", "robot_id", "sensor", "time"),
    )

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    robot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("robots.id", ondelete="CASCADE"), primary_key=True
    )
    sensor: Mapped[str] = mapped_column(String(32), primary_key=True)

    status: Mapped[str] = mapped_column(String(8), nullable=False)
    readings: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    source: Mapped[Source] = mapped_column(
        pg_enum(Source, "source", create_type=False), nullable=False
    )
