from fastapi.testclient import TestClient
from main import app


def test_health_endpoint():
    with TestClient(app) as client:
        result = client.get("/health")
        assert result.status_code == 200
        assert result.json()["status"] == "ok"


def test_empty_news_rejected():
    with TestClient(app) as client:
        result = client.post("/predict", json={"text": "short"})
        assert result.status_code == 422


def test_history_and_stats():
    with TestClient(app) as client:
        assert isinstance(client.get("/history").json(), list)
        result = client.get("/stats")
        assert result.status_code == 200
        assert all(k in result.json() for k in ("total", "real", "fake"))
