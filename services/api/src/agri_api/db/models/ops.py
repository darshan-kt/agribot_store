"""Field operations: missions, their waypoints, scouting runs and spray events."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from agri_api.db.base import Base, TimestampMixin, uuid_pk
from agri_api.db.enums import (
    MissionMode,
    MissionPattern,
    MissionStatus,
    ScoutRunStatus,
    Source,
    pg_enum,
)

if TYPE_CHECKING:
    from agri_api.db.models.core import Robot, User
    from agri_api.db.models.crop import Detection
    from agri_api.db.models.field import Field


class Mission(Base, TimestampMixin):
    __tablename__ = "missions"
    __table_args__ = (
        Index("ix_missions_robot_id_status_created_at", "robot_id", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    robot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("robots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("fields.id", ondelete="SET NULL"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    mode: Mapped[MissionMode] = mapped_column(pg_enum(MissionMode, "mission_mode"), nullable=False)
    # Null for a remote-control mission, which has no planned trajectory by definition.
    pattern: Mapped[MissionPattern | None] = mapped_column(
        pg_enum(MissionPattern, "mission_pattern")
    )
    status: Mapped[MissionStatus] = mapped_column(
        pg_enum(MissionStatus, "mission_status"),
        nullable=False,
        default=MissionStatus.PENDING,
    )
    speed_mps: Mapped[float | None] = mapped_column(Numeric(4, 2))
    # Auto-spray flagged plants. Cannot arm the sprayer on its own.
    auto_spray: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    distance_travelled_m: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    failure_reason: Mapped[str | None] = mapped_column(Text)

    robot: Mapped["Robot"] = relationship(back_populates="missions")
    field: Mapped["Field | None"] = relationship()
    author: Mapped["User | None"] = relationship()
    waypoints: Mapped[list["MissionWaypoint"]] = relationship(
        back_populates="mission", order_by="MissionWaypoint.seq", cascade="all, delete-orphan"
    )
    spray_events: Mapped[list["SprayEvent"]] = relationship(back_populates="mission")


class MissionWaypoint(Base):
    __tablename__ = "mission_waypoints"
    __table_args__ = (
        UniqueConstraint("mission_id", "seq", name="uq_mission_waypoints_mission_id_seq"),
        CheckConstraint("seq >= 0", name="seq_non_negative"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    mission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("missions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    location: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False
    )
    heading_deg: Mapped[float | None] = mapped_column(Numeric(5, 2))
    reached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    mission: Mapped["Mission"] = relationship(back_populates="waypoints")


class ScoutRun(Base, TimestampMixin):
    """One pass of the field producing detections.

    The counters are denormalised because Analytics reads them on every page load and
    recounting millions of detection rows to render a card is not a trade worth making.
    """

    __tablename__ = "scout_runs"
    __table_args__ = (
        Index("ix_scout_runs_field_id_started_at", "field_id", "started_at"),
        CheckConstraint("plants_flagged <= plants_scanned", name="flagged_not_over_scanned"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    robot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("robots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("fields.id", ondelete="SET NULL"))
    mission_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("missions.id", ondelete="SET NULL")
    )

    status: Mapped[ScoutRunStatus] = mapped_column(
        pg_enum(ScoutRunStatus, "scout_run_status"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    plants_scanned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    plants_flagged: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    distance_m: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    source: Mapped[Source] = mapped_column(
        pg_enum(Source, "source", create_type=False), nullable=False
    )

    robot: Mapped["Robot"] = relationship(back_populates="scout_runs")
    field: Mapped["Field | None"] = relationship()
    detections: Mapped[list["Detection"]] = relationship(back_populates="run")


class SprayEvent(Base, TimestampMixin):
    """A recorded discharge of pesticide.

    Written for every actuation, including auto-sprays during a mission, because this is
    the compliance record of what was applied where.
    """

    __tablename__ = "spray_events"
    __table_args__ = (
        CheckConstraint("litres >= 0", name="litres_non_negative"),
        CheckConstraint("nozzle_height_cm BETWEEN 20 AND 90", name="nozzle_height_range"),
        CheckConstraint("arc_deg IN (180, 360)", name="arc_deg_valid"),
        Index("ix_spray_events_robot_id_sprayed_at", "robot_id", "sprayed_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    robot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("robots.id", ondelete="CASCADE"), nullable=False
    )
    mission_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("missions.id", ondelete="SET NULL"), index=True
    )
    field_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("fields.id", ondelete="SET NULL"))
    # Set when this spray treated a specific flagged plant, which is what turns the map
    # dot from red to green.
    detection_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("detections.id", ondelete="SET NULL"), index=True
    )
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    sprayed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    location: Mapped[object] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True), nullable=False
    )
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    flow_lpm: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    arc_deg: Mapped[int] = mapped_column(Integer, nullable=False)
    nozzle_height_cm: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    litres: Mapped[float] = mapped_column(Numeric(7, 3), nullable=False)
    auto: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[Source] = mapped_column(
        pg_enum(Source, "source", create_type=False), nullable=False
    )

    mission: Mapped["Mission | None"] = relationship(back_populates="spray_events")
