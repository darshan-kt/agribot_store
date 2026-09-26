"""Enumerations shared by the database and the wire contracts.

These mirror packages/contracts/schemas/common/envelope.json. They are stored as native
PostgreSQL enum types: a bad value is rejected by the database, not merely by the
application that happened to write it.
"""

import enum

from sqlalchemy import Enum as SAEnum


class UserRole(enum.StrEnum):
    FARMER = "farmer"
    OPERATOR = "operator"
    ADMIN = "admin"


class Source(enum.StrEnum):
    """Where a value came from. Drives the 'Simulated' badge and nothing else does."""

    SIM = "sim"
    ROBOT = "robot"
    CLOUD = "cloud"


class Severity(enum.StrEnum):
    LOW = "low"
    MODERATE = "moderate"
    CRITICAL = "critical"


class CameraSide(enum.StrEnum):
    LEFT = "left"
    RIGHT = "right"


class IssueType(enum.StrEnum):
    """Plain-language grouping shown on the Analytics disease bars."""

    FUNGUS = "fungus"
    INSECT = "insect"
    BACTERIA = "bacteria"
    VIRUS = "virus"
    NUTRIENT = "nutrient"
    ABIOTIC = "abiotic"


class MissionMode(enum.StrEnum):
    AUTONOMOUS = "autonomous"
    REMOTE_CONTROL = "remote_control"


class MissionPattern(enum.StrEnum):
    SNAKE = "snake"
    PERIMETER = "perimeter"
    CUSTOM = "custom"


class MissionStatus(enum.StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ScoutRunStatus(enum.StrEnum):
    RUNNING = "running"
    COMPLETED = "completed"
    ABORTED = "aborted"


class InspectionStatus(enum.StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FALSE_POSITIVE = "false_positive"
    TREATED = "treated"


class AppCategory(enum.StrEnum):
    """Category chips on the store home."""

    FIELD_OPS = "field_ops"
    INSIGHTS = "insights"
    ROBOT = "robot"


class CommandKind(enum.StrEnum):
    """Every kind of command that can reach a robot. All of them are audited."""

    TELEOP = "teleop"
    ESTOP = "estop"
    MISSION = "mission"
    SPRAYER = "sprayer"
    CONFIG_SET = "config_set"


class CommandOutcome(enum.StrEnum):
    """Refusals are audited as carefully as successes: a denied spray is a safety event."""

    ACCEPTED = "accepted"
    REJECTED_AUTH = "rejected_auth"
    REJECTED_LEASE = "rejected_lease"
    REJECTED_RATE_LIMIT = "rejected_rate_limit"
    REJECTED_SAFETY = "rejected_safety"
    FAILED_PUBLISH = "failed_publish"


def pg_enum(enum_cls: type[enum.StrEnum], name: str, *, create_type: bool = True) -> "SAEnum":
    """A native PostgreSQL enum whose labels are the enum *values*, not its member names.

    SQLAlchemy defaults to storing member names, which would put 'CRITICAL' in the
    database while the wire contract and the UI both say 'critical'. Every enum column
    in the schema goes through this helper so the two can never drift.
    """
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=True,
        create_type=create_type,
        values_callable=lambda cls: [member.value for member in cls],
    )
