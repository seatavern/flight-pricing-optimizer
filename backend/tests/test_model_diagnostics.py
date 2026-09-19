from fastapi.testclient import TestClient

from app.demand_model import HIDDEN_VARIABLES, predict_mean, train_demand_model
from app.main import app
from app.market import CAPACITY, FARES, N_PERIODS
from app.myopic_evaluation import get_myopic_policy_value
from app.optimized import get_bellman_solution

HIDDEN_KEYS = set(HIDDEN_VARIABLES) | {"model", "diagnostics", "latentDemand", "strength", "mu"}
FARE_POINT_KEYS = {"fare", "predicted_mu"}
BOOKING_POINT_KEYS = {"cumulative_bookings", "predicted_mu"}
SURFACE_CELL_KEYS = {"fare", "cumulative_bookings", "predicted_mu"}


def _train() -> TestClient:
    client = TestClient(app)
    client.post("/model/train", json={"n_flights": 100})
    return client


def test_diagnostics_require_trained_model() -> None:
    client = TestClient(app)
    response = client.post(
        "/model/diagnostics",
        json={"kind": "fare", "period": 2, "cumulative_bookings": 52},
    )
    assert response.status_code == 409
    assert HIDDEN_KEYS.isdisjoint(response.json().keys())


def test_fare_diagnostic_returns_nine_grid_points() -> None:
    train_demand_model(100, 1)
    client = TestClient(app)
    payload = client.post(
        "/model/diagnostics",
        json={"kind": "fare", "period": 2, "cumulative_bookings": 52},
    ).json()
    assert payload["kind"] == "fare"
    assert payload["period"] == 2
    assert payload["cumulative_bookings"] == 52
    fares = [row["fare"] for row in payload["points"]]
    assert fares == FARES.tolist()
    assert len(payload["points"]) == 9
    assert HIDDEN_KEYS.isdisjoint(payload.keys())
    for row in payload["points"]:
        assert set(row.keys()) == FARE_POINT_KEYS
        assert HIDDEN_KEYS.isdisjoint(row.keys())
        expected = predict_mean(2, row["fare"], 52)
        assert abs(row["predicted_mu"] - expected) < 1e-12


def test_bookings_diagnostic_covers_capacity_states() -> None:
    client = _train()
    payload = client.post(
        "/model/diagnostics",
        json={"kind": "bookings", "period": 0, "fare": 100},
    ).json()
    assert payload["kind"] == "bookings"
    assert payload["fare"] == 100
    sold = [row["cumulative_bookings"] for row in payload["points"]]
    assert sold == list(range(CAPACITY + 1))
    assert len(payload["points"]) == CAPACITY + 1
    for sold_count in (0, 25, 52, 100):
        row = payload["points"][sold_count]
        expected = predict_mean(0, 100, sold_count)
        assert abs(row["predicted_mu"] - expected) < 1e-12
        assert set(row.keys()) == BOOKING_POINT_KEYS


def test_surface_diagnostic_is_nine_by_capacity() -> None:
    client = _train()
    payload = client.post("/model/diagnostics", json={"kind": "surface", "period": 4}).json()
    assert payload["kind"] == "surface"
    assert len(payload["cells"]) == 9 * (CAPACITY + 1)
    sample = next(
        cell
        for cell in payload["cells"]
        if cell["fare"] == 80 and cell["cumulative_bookings"] == 40
    )
    assert abs(sample["predicted_mu"] - predict_mean(4, 80, 40)) < 1e-12
    assert set(sample.keys()) == SURFACE_CELL_KEYS
    assert HIDDEN_KEYS.isdisjoint(payload.keys())


def test_off_grid_fare_is_rejected() -> None:
    client = _train()
    response = client.post(
        "/model/diagnostics",
        json={"kind": "bookings", "period": 1, "fare": 75},
    )
    assert response.status_code == 422


def test_retrain_changes_diagnostic_and_invalidates_policy_caches() -> None:
    train_demand_model(100, 1)
    client = TestClient(app)
    first = client.post(
        "/model/diagnostics",
        json={"kind": "fare", "period": 2, "cumulative_bookings": 52},
    ).json()
    myopic_one = get_myopic_policy_value()
    bellman_one = get_bellman_solution()
    client.post("/model/train", json={"n_flights": 1000})
    second = client.post(
        "/model/diagnostics",
        json={"kind": "fare", "period": 2, "cumulative_bookings": 52},
    ).json()
    myopic_two = get_myopic_policy_value()
    bellman_two = get_bellman_solution()
    assert myopic_two is not myopic_one
    assert bellman_two is not bellman_one
    assert second["points"][0]["predicted_mu"] == predict_mean(2, FARES[0], 52)
    assert any(
        abs(left["predicted_mu"] - right["predicted_mu"]) > 1e-12
        for left, right in zip(first["points"], second["points"], strict=True)
    ) or myopic_two.model_id != myopic_one.model_id


def test_diagnostics_source_has_no_hidden_dgp() -> None:
    import inspect

    from app import model_diagnostics

    source = inspect.getsource(model_diagnostics)
    for name in (
        "period_dgp",
        "true_market_mean",
        "sample_strength",
        "EXPECTED_FARE_MIN",
        "ELASTICITY_MIN",
    ):
        assert name not in source
    assert N_PERIODS == 10
