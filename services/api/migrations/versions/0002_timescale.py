"""TimescaleDB: hypertables, compression, retention and continuous aggregates.

Kept separate from 0001 because none of this is expressible in SQLAlchemy metadata, and
because none of it round-trips through Alembic autogenerate: env.py excludes the
continuous aggregates from reflection so they are never proposed for deletion.

Retention is deliberately short for the raw tables and long for the rollups: an operator
asks "what is the battery doing right now" against raw telemetry, and "how has infection
trended over the season" against the daily aggregate.

Revision ID: 0002_timescale
Revises: 0001_initial
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_timescale"
down_revision: str | Sequence[str] | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Raw telemetry at up to 10 Hz is large and only interesting while it is fresh.
TELEMETRY_RETENTION = "30 days"
SENSOR_RETENTION = "14 days"


def upgrade() -> None:
    conn = op.get_bind()

    # ---------------------------------------------------------------- hypertables --
    # migrate_data is unnecessary (the tables are empty) but harmless, and makes the
    # migration safe to run against a database that somehow already has rows.
    for table in ("telemetry", "sensor_readings"):
        conn.exec_driver_sql(
            f"SELECT create_hypertable('{table}', 'time', "
            "chunk_time_interval => INTERVAL '1 day', migrate_data => TRUE, if_not_exists => TRUE);"
        )

    # ---------------------------------------------------------------- compression --
    conn.exec_driver_sql(
        "ALTER TABLE telemetry SET ("
        "timescaledb.compress, "
        "timescaledb.compress_segmentby = 'robot_id', "
        "timescaledb.compress_orderby = 'time DESC');"
    )
    conn.exec_driver_sql(
        "ALTER TABLE sensor_readings SET ("
        "timescaledb.compress, "
        "timescaledb.compress_segmentby = 'robot_id, sensor', "
        "timescaledb.compress_orderby = 'time DESC');"
    )
    conn.exec_driver_sql(
        "SELECT add_compression_policy('telemetry', INTERVAL '2 days', if_not_exists => TRUE);"
    )
    conn.exec_driver_sql(
        "SELECT add_compression_policy('sensor_readings', INTERVAL '2 days', if_not_exists => TRUE);"
    )

    # ------------------------------------------------------------------ retention --
    conn.exec_driver_sql(
        f"SELECT add_retention_policy('telemetry', INTERVAL '{TELEMETRY_RETENTION}', "
        "if_not_exists => TRUE);"
    )
    conn.exec_driver_sql(
        f"SELECT add_retention_policy('sensor_readings', INTERVAL '{SENSOR_RETENTION}', "
        "if_not_exists => TRUE);"
    )

    # -------------------------------------------------------- continuous aggregate --
    autocommit = conn

    # One row per robot per minute. Backs the Dashboard battery and compute trends
    # without scanning raw telemetry.
    autocommit.exec_driver_sql(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_1min
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket(INTERVAL '1 minute', time) AS bucket,
            robot_id,
            avg(battery_percent)  AS battery_percent_avg,
            min(battery_percent)  AS battery_percent_min,
            avg(signal_dbm)       AS signal_dbm_avg,
            avg(speed_mps)        AS speed_mps_avg,
            max(speed_mps)        AS speed_mps_max,
            avg(cpu_percent)      AS cpu_percent_avg,
            avg(gpu_percent)      AS gpu_percent_avg,
            avg(memory_percent)   AS memory_percent_avg,
            max(cpu_temp_c)       AS cpu_temp_c_max,
            avg(detection_fps)    AS detection_fps_avg,
            count(*)              AS samples
        FROM telemetry
        GROUP BY bucket, robot_id
        WITH NO DATA;
        """
    )
    autocommit.exec_driver_sql(
        """
        SELECT add_continuous_aggregate_policy('telemetry_1min',
            start_offset => INTERVAL '3 hours',
            end_offset   => INTERVAL '1 minute',
            schedule_interval => INTERVAL '1 minute',
            if_not_exists => TRUE);
        """
    )
    # The rollup outlives the raw data it came from: trends survive retention.
    autocommit.exec_driver_sql(
        "SELECT add_retention_policy('telemetry_1min', INTERVAL '365 days', if_not_exists => TRUE);"
    )

    # Detections are a plain table, not a hypertable — they are low-volume, individually
    # meaningful and must never be aged out. The Analytics trend chart reads this
    # ordinary materialized view, refreshed after each scouting run.
    autocommit.exec_driver_sql(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS detections_daily AS
        SELECT
            date_trunc('day', d.detected_at) AS day,
            d.field_id,
            d.robot_id,
            d.issue_id,
            d.severity,
            count(*) AS detection_count,
            avg(d.confidence) AS confidence_avg
        FROM detections d
        GROUP BY 1, 2, 3, 4, 5
        WITH NO DATA;
        """
    )
    autocommit.exec_driver_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_detections_daily "
        "ON detections_daily (day, field_id, robot_id, issue_id, severity);"
    )


def downgrade() -> None:
    conn = op.get_bind()
    autocommit = conn

    autocommit.exec_driver_sql("DROP MATERIALIZED VIEW IF EXISTS detections_daily;")
    autocommit.exec_driver_sql("DROP MATERIALIZED VIEW IF EXISTS telemetry_1min CASCADE;")

    for table in ("telemetry", "sensor_readings"):
        conn.exec_driver_sql(f"SELECT remove_retention_policy('{table}', if_exists => TRUE);")
        conn.exec_driver_sql(f"SELECT remove_compression_policy('{table}', if_exists => TRUE);")
    # The hypertables themselves are dropped by 0001's downgrade along with the tables.
