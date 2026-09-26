-- Extensions the schema depends on. Created once, at first cluster init.
-- TimescaleDB is preloaded by the image; PostGIS ships in the same image.
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Everything is UTC on the wire and in the database (docs/ARCHITECTURE.md §7).
ALTER DATABASE agri SET timezone TO 'UTC';
