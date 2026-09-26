"""Fields and their rows, as real geography.

A field is a polygon because the geofence interlock asks "is the robot inside it?", and
a row is a linestring because "which row is this plant in, and how far along?" is how a
farmer navigates to it on foot.
"""

import uuid
from typing import TYPE_CHECKING

from geoalchemy2 import Geography, Geometry
from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from agri_api.db.base import Base, TimestampMixin, uuid_pk

if TYPE_CHECKING:
    from agri_api.db.models.core import Organization


class Field(Base, TimestampMixin):
    __tablename__ = "fields"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_fields_organization_id_name"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    crop: Mapped[str] = mapped_column(String(64), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    area_hectares: Mapped[float | None] = mapped_column(Numeric(8, 3))

    # The geofence. Spraying outside this polygon is refused, in the backend and again
    # on the robot. SRID 4326 (WGS 84) throughout, matching what GPS reports.
    boundary: Mapped[object] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True), nullable=False
    )
    # Centroid kept separately so the map can frame the field without loading the polygon.
    centroid: Mapped[object | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False)
    )

    organization: Mapped["Organization"] = relationship(back_populates="fields")
    rows: Mapped[list["FieldRow"]] = relationship(
        back_populates="field", order_by="FieldRow.row_number", cascade="all, delete-orphan"
    )


class FieldRow(Base, TimestampMixin):
    __tablename__ = "field_rows"
    __table_args__ = (
        UniqueConstraint("field_id", "row_number", name="uq_field_rows_field_id_row_number"),
        CheckConstraint("row_number >= 1", name="row_number_positive"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    field_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fields.id", ondelete="CASCADE"), nullable=False, index=True
    )
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Centreline of the row. Distance along it gives "metres from edge".
    path: Mapped[object] = mapped_column(
        Geometry(geometry_type="LINESTRING", srid=4326, spatial_index=True), nullable=False
    )
    length_m: Mapped[float | None] = mapped_column(Numeric(8, 2))
    plant_count: Mapped[int | None] = mapped_column(Integer)

    field: Mapped["Field"] = relationship(back_populates="rows")
