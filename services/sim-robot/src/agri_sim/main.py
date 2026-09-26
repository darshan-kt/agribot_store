"""Sim robot entry point.

PHASE 0 SCAFFOLD: connects to the broker, announces itself and idles with a heartbeat.
The full emulation (pose, sensors, camera frames, detections, sprayer physics, battery,
mission following, deadman) lands in Phase 3 once the contracts exist — see docs/PLAN.md.
"""

import asyncio
import contextlib
import json
import signal
import ssl
import time

import aiomqtt
import structlog

from agri_sim import __version__
from agri_sim.settings import SimSettings

log = structlog.get_logger(__name__)

SCHEMA_VERSION = "0.0.0-scaffold"


def _tls_params(settings: SimSettings) -> aiomqtt.TLSParameters | None:
    """TLS for the broker link. A real robot always connects over 8883."""
    if not settings.mqtt_tls:
        return None
    return aiomqtt.TLSParameters(
        ca_certs=settings.mqtt_ca_cert,
        cert_reqs=ssl.CERT_REQUIRED,
        tls_version=ssl.PROTOCOL_TLS_CLIENT,
    )


def _topic(robot_id: str, suffix: str) -> str:
    return f"agri/v1/{robot_id}/{suffix}"


def _envelope(robot_id: str, seq: int, **fields: object) -> bytes:
    """Every payload carries the common envelope. Frozen in Phase 1."""
    payload = {
        "schema_version": SCHEMA_VERSION,
        "robot_id": robot_id,
        "ts": time.time_ns(),
        "seq": seq,
        "source": "sim",
        **fields,
    }
    return json.dumps(payload).encode()


async def run(settings: SimSettings, stop: asyncio.Event) -> None:
    state_topic = _topic(settings.robot_id, "state")
    will = aiomqtt.Will(
        topic=state_topic,
        payload=_envelope(settings.robot_id, 0, online=False, reason="lwt"),
        qos=1,
        retain=True,
    )

    async with aiomqtt.Client(
        hostname=settings.mqtt_host,
        port=settings.mqtt_port,
        username=settings.mqtt_username,
        password=settings.mqtt_password or None,
        will=will,
        keepalive=5,
        identifier=settings.robot_id,
        tls_params=_tls_params(settings),
    ) as client:
        log.info(
            "sim.connected",
            robot_id=settings.robot_id,
            broker=settings.mqtt_host,
            port=settings.mqtt_port,
            tls=settings.mqtt_tls,
        )
        seq = 0
        await client.publish(
            state_topic,
            _envelope(settings.robot_id, seq, online=True, version=__version__, mode="scaffold"),
            qos=1,
            retain=True,
        )
        while not stop.is_set():
            seq += 1
            await client.publish(
                _topic(settings.robot_id, "events"),
                _envelope(settings.robot_id, seq, kind="heartbeat", note="phase-0 scaffold"),
                qos=0,
            )
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=5.0)

        await client.publish(
            state_topic,
            _envelope(settings.robot_id, seq + 1, online=False, reason="shutdown"),
            qos=1,
            retain=True,
        )
        log.info("sim.stopped", robot_id=settings.robot_id)


async def main() -> None:
    from agri_sim.logging import configure_logging

    settings = SimSettings()
    configure_logging(settings.log_level)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    backoff = 1.0
    while not stop.is_set():
        try:
            await run(settings, stop)
        except aiomqtt.MqttError as exc:
            log.warning("sim.broker_lost", error=str(exc), retry_in=backoff)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=backoff)
            backoff = min(backoff * 2, 30.0)
        else:
            break


if __name__ == "__main__":
    asyncio.run(main())
