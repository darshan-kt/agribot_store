import json

from agri_sim.main import _envelope, _topic


def test_topic_is_namespaced_per_robot() -> None:
    assert _topic("scout-01", "pose") == "agri/v1/scout-01/pose"


def test_envelope_carries_the_common_fields() -> None:
    payload = json.loads(_envelope("scout-01", 7, online=True))
    assert payload["robot_id"] == "scout-01"
    assert payload["seq"] == 7
    assert payload["source"] == "sim"
    assert isinstance(payload["ts"], int)
    assert "schema_version" in payload


def test_source_is_always_sim() -> None:
    """The Simulated badge in the UI is driven by this field, so the sim may never omit it."""
    payload = json.loads(_envelope("scout-01", 1))
    assert payload["source"] == "sim"
