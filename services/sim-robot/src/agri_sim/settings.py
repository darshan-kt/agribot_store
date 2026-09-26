"""Sim robot settings. The sim uses its own broker credentials, like a real robot."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class SimSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SIM_", env_file=".env", extra="ignore")

    robot_id: str = "scout-01"
    log_level: str = "INFO"

    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str = "scout-01"
    mqtt_password: str = ""
    mqtt_tls: bool = False
    mqtt_ca_cert: str | None = None

    # Publish rates (Hz), matched to the latency budget in docs/ARCHITECTURE.md §3.
    pose_hz: float = 10.0
    telemetry_hz: float = 2.0
    sensors_hz: float = 1.0
    camera_fps: float = 10.0

    # Safety: the deadman is enforced here, on the robot side, not in the browser.
    teleop_deadman_ms: int = 300
