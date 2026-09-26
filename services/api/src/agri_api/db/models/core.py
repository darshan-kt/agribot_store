"""Organizations, users, robots and versioned robot configuration."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from agri_api.db.base import Base, TimestampMixin, uuid_pk
from agri_api.db.enums import UserRole, pg_enum

if TYPE_CHECKING:
    from agri_api.db.models.crop import Inspection
    from agri_api.db.models.field import Field
    from agri_api.db.models.ops import Mission, ScoutRun
    from agri_api.db.models.store import AppInstall


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)

    users: Mapped[list["User"]] = relationship(back_populates="organization")
    robots: Mapped[list["Robot"]] = relationship(back_populates="organization")
    fields: Mapped[list["Field"]] = relationship(back_populates="organization")


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[UserRole] = mapped_column(pg_enum(UserRole, "user_role"), nullable=False)
    # Argon2/bcrypt digest. Null for an account that cannot sign in locally.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organization: Mapped["Organization"] = relationship(back_populates="users")
    inspections: Mapped[list["Inspection"]] = relationship(back_populates="user")


class Robot(Base, TimestampMixin):
    __tablename__ = "robots"
    __table_args__ = (
        UniqueConstraint("robot_id", name="uq_robots_robot_id"),
        CheckConstraint(
            "battery_percent IS NULL OR (battery_percent >= 0 AND battery_percent <= 100)",
            name="battery_percent_range",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The MQTT identity: username, client id and topic segment are all this value.
    robot_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    firmware: Mapped[str | None] = mapped_column(String(32))
    serial: Mapped[str | None] = mapped_column(String(64))

    # Last known state, mirrored from the retained MQTT `state` topic so the store home
    # can render without waiting for a live message.
    online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    mode: Mapped[str | None] = mapped_column(String(16))
    estop_engaged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    battery_percent: Mapped[float | None] = mapped_column(Numeric(5, 2))
    current_field_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("fields.id", ondelete="SET NULL")
    )
    current_row: Mapped[int | None] = mapped_column(Integer)
    active_config_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    organization: Mapped["Organization"] = relationship(back_populates="robots")
    current_field: Mapped["Field | None"] = relationship(foreign_keys=[current_field_id])
    config_versions: Mapped[list["RobotConfigVersion"]] = relationship(
        back_populates="robot", order_by="RobotConfigVersion.version.desc()"
    )
    missions: Mapped[list["Mission"]] = relationship(back_populates="robot")
    scout_runs: Mapped[list["ScoutRun"]] = relationship(back_populates="robot")
    installs: Mapped[list["AppInstall"]] = relationship(back_populates="robot")


class RobotConfigVersion(Base, TimestampMixin):
    """One row per configuration change.

    A change is only shown as applied once the robot acknowledges it on config/ack with
    a matching version, so `acked_at IS NULL` means pending, not failed.
    """

    __tablename__ = "robot_config_versions"
    __table_args__ = (
        UniqueConstraint("robot_id", "version", name="uq_robot_config_versions_robot_id_version"),
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint(
            "detection_sensitivity >= 0 AND detection_sensitivity <= 1",
            name="detection_sensitivity_range",
        ),
        CheckConstraint("max_speed_mps > 0 AND max_speed_mps <= 5", name="max_speed_range"),
        CheckConstraint(
            "return_to_base_battery_percent BETWEEN 5 AND 95", name="return_to_base_range"
        ),
        CheckConstraint("camera_fps BETWEEN 1 AND 60", name="camera_fps_range"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    robot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("robots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)

    max_speed_mps: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False)
    detection_sensitivity: Mapped[float] = mapped_column(Numeric(3, 2), nullable=False)
    return_to_base_battery_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    camera_fps: Mapped[int] = mapped_column(Integer, nullable=False)
    obstacle_stop_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    acked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_reason: Mapped[str | None] = mapped_column(String(255))
    raw: Mapped[dict[str, object] | None] = mapped_column(JSONB)

    robot: Mapped["Robot"] = relationship(back_populates="config_versions")
    author: Mapped["User | None"] = relationship(foreign_keys=[created_by])


class ControlLease(Base, TimestampMixin):
    """Exactly one operator may drive a robot at a time.

    Redis holds the live lease for speed; this table is the durable record so the UI can
    say who holds control and until when, and so a takeover is attributable afterwards.
    """

    __tablename__ = "control_leases"
    __table_args__ = (UniqueConstraint("robot_id", name="uq_control_leases_robot_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    robot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("robots.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    robot: Mapped["Robot"] = relationship()
    user: Mapped["User"] = relationship()
