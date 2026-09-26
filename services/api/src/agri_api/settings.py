"""Runtime settings. Every value comes from the environment; see .env.example."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGRI_", env_file=".env", extra="ignore")

    env: Literal["local", "ci", "prod"] = "local"
    log_level: str = "INFO"
    api_host: str = "0.0.0.0"  # noqa: S104 - bound inside the container network only
    api_port: int = 8000
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    database_url: str = "postgresql+asyncpg://agri:agri@localhost:5432/agri"
    redis_url: str = "redis://localhost:6379/0"

    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str = "api"
    mqtt_password: str = ""
    mqtt_tls: bool = False
    mqtt_ca_cert: str | None = None

    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "agri-images"

    # No default: a missing AGRI_JWT_SECRET must fail loudly, never fall back to a known value.
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_ttl_seconds: int = 3600

    # Safety knobs (see docs/ARCHITECTURE.md §4). Enforced on the robot too.
    teleop_deadman_ms: int = 300
    control_lease_ttl_seconds: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
