"""Alembic environment.

The database URL comes from AGRI_DATABASE_URL via Settings, never from alembic.ini, so
migrations cannot accidentally run against a different database than the application.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from agri_api.db.base import Base
from agri_api.settings import get_settings

# Imported for the side effect of registering every model on Base.metadata.
import agri_api.db.models  # noqa: F401  isort:skip

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata

# TimescaleDB creates internal objects in these schemas, and its continuous aggregates
# appear as views. Autogenerate must ignore all of it or every run produces a migration
# that tries to drop Timescale's own machinery.
EXCLUDED_SCHEMAS = frozenset(
    {
        "_timescaledb_internal",
        "_timescaledb_catalog",
        "_timescaledb_config",
        "_timescaledb_cache",
        "_timescaledb_functions",
        "timescaledb_information",
        "timescaledb_experimental",
        "tiger",
        "tiger_data",
        "topology",
    }
)
EXCLUDED_TABLES = frozenset({"spatial_ref_sys"})
CONTINUOUS_AGGREGATES = frozenset({"detections_daily", "telemetry_1min"})


def include_object(obj, name: str, type_: str, reflected: bool, compare_to: object) -> bool:
    if getattr(obj, "schema", None) in EXCLUDED_SCHEMAS:
        return False
    return not (type_ == "table" and (name in EXCLUDED_TABLES or name in CONTINUOUS_AGGREGATES))


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
