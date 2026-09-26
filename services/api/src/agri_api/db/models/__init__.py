"""All ORM models.

Imported for their side effect of registering with Base.metadata, which is what Alembic
autogenerate reflects against.
"""

from agri_api.db.models.audit import AuditLog
from agri_api.db.models.core import (
    ControlLease,
    Organization,
    Robot,
    RobotConfigVersion,
    User,
)
from agri_api.db.models.crop import Detection, Inspection, IssueCatalog
from agri_api.db.models.field import Field, FieldRow
from agri_api.db.models.ops import Mission, MissionWaypoint, ScoutRun, SprayEvent
from agri_api.db.models.store import AppInstall, StoreApp
from agri_api.db.models.timeseries import SensorReading, Telemetry

__all__ = [
    "AppInstall",
    "AuditLog",
    "ControlLease",
    "Detection",
    "Field",
    "FieldRow",
    "Inspection",
    "IssueCatalog",
    "Mission",
    "MissionWaypoint",
    "Organization",
    "Robot",
    "RobotConfigVersion",
    "ScoutRun",
    "SensorReading",
    "SprayEvent",
    "StoreApp",
    "Telemetry",
    "User",
]
