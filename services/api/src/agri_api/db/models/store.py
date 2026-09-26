"""The app store catalog and per-robot installs."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from agri_api.db.base import Base, TimestampMixin, uuid_pk
from agri_api.db.enums import AppCategory, pg_enum

if TYPE_CHECKING:
    from agri_api.db.models.core import Organization, Robot


class StoreApp(Base, TimestampMixin):
    """One of the four apps on the store home.

    The live badge ("14 critical", "1 check") is computed per robot at read time, not
    stored here: a badge that can go stale is worse than no badge.
    """

    __tablename__ = "store_apps"
    __table_args__ = (UniqueConstraint("slug", name="uq_store_apps_slug"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    tagline: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[AppCategory] = mapped_column(
        pg_enum(AppCategory, "app_category"), nullable=False
    )
    icon: Mapped[str] = mapped_column(String(64), nullable=False)
    # Crop Scout is the featured app on the store home.
    featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Position in the "Plan → Scout → Analyse → Spray" flow strip; null if not in it.
    flow_position: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    route: Mapped[str] = mapped_column(String(128), nullable=False)

    installs: Mapped[list["AppInstall"]] = relationship(back_populates="app")


class AppInstall(Base, TimestampMixin):
    __tablename__ = "app_installs"
    __table_args__ = (
        UniqueConstraint("app_id", "robot_id", name="uq_app_installs_app_id_robot_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    app_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("store_apps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    robot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("robots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    app: Mapped["StoreApp"] = relationship(back_populates="installs")
    robot: Mapped["Robot"] = relationship(back_populates="installs")
    organization: Mapped["Organization"] = relationship()
