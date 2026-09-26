"""Append-only audit of every command that was aimed at a robot.

Written before the command is published, and written whether it succeeded or was
refused: a denied spray attempt is exactly the record an investigation needs.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from agri_api.db.base import Base, uuid_pk
from agri_api.db.enums import CommandKind, CommandOutcome, pg_enum


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_robot_id_created_at", "robot_id", "created_at"),
        Index("ix_audit_log_user_id_created_at", "user_id", "created_at"),
        Index("ix_audit_log_outcome_created_at", "outcome", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    robot_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("robots.id", ondelete="SET NULL"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    kind: Mapped[CommandKind] = mapped_column(pg_enum(CommandKind, "command_kind"), nullable=False)
    outcome: Mapped[CommandOutcome] = mapped_column(
        pg_enum(CommandOutcome, "command_outcome"), nullable=False
    )
    # Which interlock or check refused it. Null when accepted.
    reason: Mapped[str | None] = mapped_column(String(120))
    # The command as published, so the record is reconstructable without the broker.
    payload: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    detail: Mapped[str | None] = mapped_column(Text)

    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(255))
