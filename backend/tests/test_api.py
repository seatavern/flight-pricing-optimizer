import inspect

from fastapi.testclient import TestClient

from app.demand_model import HIDDEN_VARIABLES, TEST_SEED, TRAIN_SEED, TRAINING_SIZES, train_demand_model
from app.main import app

HIDDEN_KEYS = set(HIDDEN_VARIABLES) | {"model", "diagnostics", "latentDemand"}


def test_lifespan_trains_and_activates_standard_demand_model(monkeypatch) -> None:
    calls: list[tuple[int, int, dict[str, object]]] = []

    def spy(n_flights: int, seed: int, **kwargs: object) -> None:
        calls.append((n_flights, seed, kwargs))

    monkeypatch.setattr("app.main.train_demand_model", spy)
    with TestClient(app):
        pass

    assert calls == [(10_000, TRAIN_SEED, {})]
    assert inspect.signature(train_demand_model).parameters["set_active"].default is True


def test_status_is_not_trained_before_training() -> None:
    client = TestClient(app)
    response = client.get("/model/status")
    assert response.status_code == 200
    assert response.json() == {"status": "not_trained"}
    assert HIDDEN_KEYS.isdisjoint(response.json().keys())


def test_train_rejects_disallowed_flight_counts() -> None:
    client = TestClient(app)
    response = client.post("/model/train", json={"n_flights": 250})
    assert response.status_code == 422
    assert TRAINING_SIZES == (100, 1_000, 5_000, 10_000)


def test_train_uses_deterministic_seed_and_returns_public_metrics() -> None:
    client = TestClient(app)
    response = client.post("/model/train", json={"n_flights": 100})
    payload = response.json()
    assert response.status_code == 200
    assert payload["status"] == "ready"
    assert payload["n_flights"] == 100
    assert payload["n_observations"] == 1000
    assert payload["mae"] >= 0
    assert payload["rmse"] >= 0
    assert payload["training_time_seconds"] >= 0
    assert set(payload.keys()) == {
        "status",
        "n_flights",
        "n_observations",
        "mae",
        "rmse",
        "training_time_seconds",
    }
    assert HIDDEN_KEYS.isdisjoint(payload.keys())
    assert TRAIN_SEED != TEST_SEED

    status = client.get("/model/status").json()
    assert status == payload


def test_retrain_replaces_active_model_metadata() -> None:
    client = TestClient(app)
    first = client.post("/model/train", json={"n_flights": 100}).json()
    second = client.post("/model/train", json={"n_flights": 1000})
    payload = second.json()
    assert second.status_code == 200
    assert payload["n_flights"] == 1000
    assert payload["n_observations"] == 10_000
    status = client.get("/model/status").json()
    assert status["n_flights"] == 1000
    assert status["n_observations"] != first["n_observations"]
