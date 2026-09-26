from fastapi.testclient import TestClient

from agri_api.main import create_app


def test_healthz_reports_ok() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_readyz_declares_scaffold_state() -> None:
    """Phase 0 must not claim readiness it has not verified."""
    with TestClient(create_app()) as client:
        response = client.get("/readyz")
    assert response.status_code == 200
    assert response.json()["status"] == "scaffold"
