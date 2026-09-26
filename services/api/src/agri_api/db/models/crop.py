"""Crop issues: the catalog, the detections, and what a human decided about them."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from geoalchemy2 import Geography
from sqlalchemy import (
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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from agri_api.db.base import Base, TimestampMixin, uuid_pk
from agri_api.db.enums import (
    CameraSide,
    InspectionStatus,
    IssueType,
    Severity,
    Source,
    pg_enum,
)

if TYPE_CHECKING:
    from agri_api.db.models.core import Robot, User
    from agri_api.db.models.field import Field
    from agri_api.db.models.ops import ScoutRun


class IssueCatalog(Base, TimestampMixin):
    """Plain-language reference for every issue the vision model can report.

    This is the only place farmer-facing disease copy lives. The detection rows carry a
    code; the words a farmer reads come from here, so fixing a confusing explanation is
    one update rather than a migration over millions of detections.
    """

    __tablename__ = "issue_catalog"
    __table_args__ = (UniqueConstraint("code", name="uq_issue_catalog_code"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    # "Late blight", not "Phytophthora infestans".
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    scientific_name: Mapped[str | None] = mapped_column(String(120))
    issue_type: Mapped[IssueType] = mapped_column(pg_enum(IssueType, "issue_type"), nullable=False)
    what_it_is: Mapped[str] = mapped_column(Text, nullable=False)
    what_to_do: Mapped[str] = mapped_column(Text, nullable=False)
    # Days within which a critical finding should be actioned; drives the alert sentence.
    action_within_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)

    detections: Mapped[list["Detection"]] = relationship(back_populates="issue")


class Detection(Base, TimestampMixin):
    __tablename__ = "detections"
    __table_args__ = (
        # A redelivered QoS 1 message must not create a second row.
        UniqueConstraint("robot_id", "detection_uid", name="uq_detections_robot_id_detection_uid"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="confidence_range"),
        CheckConstraint(
            "bbox_x >= 0 AND bbox_x <= 1 AND bbox_y >= 0 AND bbox_y <= 1 "
            "AND bbox_w > 0 AND bbox_w <= 1 AND bbox_h > 0 AND bbox_h <= 1",
            name="bbox_normalised",
        ),
        Index("ix_detections_field_id_severity_detected_at", "field_id", "severity", "detected_at"),
        Index("ix_detections_run_id_detected_at", "run_id", "detected_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # Generated on the robot, which is what makes the dedup constraint above work.
    detection_uid: Mapped[uuid.UUID] = mapped_column(nullable=False)

    robot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("robots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("scout_runs.id", ondelete="SET NULL"), index=True
    )
    field_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("fields.id", ondelete="SET NULL"), index=True
    )
    issue_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("issue_catalog.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    severity: Mapped[Severity] = mapped_column(pg_enum(Severity, "severity"), nullable=False)
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False)
    camera: Mapped[CameraSide] = mapped_column(pg_enum(CameraSide, "camera_side"), nullable=False)

    # Normalised to the frame, so the box lands correctly on any resolution.
    bbox_x: Mapped[float] = mapped_column(Numeric(6, 5), nullable=False)
    bbox_y: Mapped[float] = mapped_column(Numeric(6, 5), nullable=False)
    bbox_w: Mapped[float] = mapped_column(Numeric(6, 5), nullable=False)
    bbox_h: Mapped[float] = mapped_column(Numeric(6, 5), nullable=False)

    location: Mapped[object | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=True)
    )
    row: Mapped[int | None] = mapped_column(Integer, index=True)
    # How far along the row to walk. The number a farmer actually uses.
    metres_from_edge: Mapped[float | None] = mapped_column(Numeric(7, 2))

    image_key: Mapped[str | None] = mapped_column(String(255))
    crop_key: Mapped[str | None] = mapped_column(String(255))

    # Never derived on the frontend. This is what the "Simulated" badge reads.
    source: Mapped[Source] = mapped_column(pg_enum(Source, "source"), nullable=False)

    robot: Mapped["Robot"] = relationship()
    run: Mapped["ScoutRun | None"] = relationship(back_populates="detections")
    field: Mapped["Field | None"] = relationship()
    issue: Mapped["IssueCatalog"] = relationship(back_populates="detections")
    inspections: Mapped[list["Inspection"]] = relationship(
        back_populates="detection", cascade="all, delete-orphan"
    )


class Inspection(Base, TimestampMixin):
    """A human's verdict on a detection. Recorded, never overwritten."""

    __tablename__ = "inspections"
    __table_args__ = (
        Index("ix_inspections_detection_id_created_at", "detection_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    detection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("detections.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[InspectionStatus] = mapped_column(
        pg_enum(InspectionStatus, "inspection_status"), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[dict[str, object] | None] = mapped_column(JSONB)

    detection: Mapped["Detection"] = relationship(back_populates="inspections")
    user: Mapped["User | None"] = relationship(back_populates="inspections")
