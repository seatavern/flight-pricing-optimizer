from fastapi.testclient import TestClient

from app.demand_model import HIDDEN_VARIABLES, train_demand_model
from app.main import app
from app.market import CAPACITY, FARES
from app.myopic import myopic_decision
from app.optimized import optimized_decision

HIDDEN_KEYS = set(HIDDEN_VARIABLES) | {"model", "diagnostics", "latentDemand", "strength", "mu"}
CANDIDATE_KEYS = {
    "fare",
    "predicted_mu",
    "expected_sales",
    "immediate_expected_revenue",
    "future_value",
    "total_value",
}
RESPONSE_KEYS = {
    "period",
    "remaining_capacity",
    "cumulative_bookings",
    "myopic_selected_fare",
    "myopic_immediate_expected_revenue",
    "myopic_continuation_value",
    "myopic_total_policy_value",
    "optimized_selected_fare",
    "optimized_immediate_expected_revenue",
    "optimized_continuation_value",
    "optimized_total_policy_value",
    "candidates",
}


def _train() -> TestClient:
    client = TestClient(app)
    client.post("/model/train", json={"n_flights": 100})
    return client


def test_decision_requires_trained_model() -> None:
    client = TestClient(app)
    response = client.post("/pricing/decision", json={"period": 2, "remaining_capacity": 48})
    assert response.status_code == 409
    assert HIDDEN_KEYS.isdisjoint(response.json().keys())


def test_decision_returns_nine_fares_and_public_fields() -> None:
    client = _train()
    response = client.post("/pricing/decision", json={"period": 2, "remaining_capacity": 48})
    payload = response.json()
    assert response.status_code == 200
    assert set(payload.keys()) == RESPONSE_KEYS
    assert payload["period"] == 2
    assert payload["remaining_capacity"] == 48
    assert payload["cumulative_bookings"] == 52
    fares = [row["fare"] for row in payload["candidates"]]
    assert fares == FARES.tolist()
    assert len(payload["candidates"]) == 9
    assert payload["myopic_selected_fare"] in fares
    assert payload["optimized_selected_fare"] in fares
    assert HIDDEN_KEYS.isdisjoint(payload.keys())
    for row in payload["candidates"]:
        assert set(row.keys()) == CANDIDATE_KEYS
        assert HIDDEN_KEYS.isdisjoint(row.keys())


def test_myopic_choice_is_max_immediate_revenue() -> None:
    train_demand_model(100, 1)
    client = TestClient(app)
    response = client.post("/pricing/decision", json={"period": 4, "remaining_capacity": 60})
    payload = response.json()
    myopic = myopic_decision(4, 40)
    revenues = [row.expected_revenue for row in myopic.candidates]
    winner = myopic.candidates[revenues.index(max(revenues))]
    assert payload["myopic_selected_fare"] == myopic.selected_fare
    assert payload["myopic_selected_fare"] == winner.fare


def test_optimized_choice_is_max_total_value() -> None:
    client = _train()
    payload = client.post("/pricing/decision", json={"period": 2, "remaining_capacity": 48}).json()
    totals = [row["total_value"] for row in payload["candidates"]]
    best_index = 0
    best_value = totals[0]
    for index, value in enumerate(totals):
        if value > best_value + 1e-9:
            best_value = value
            best_index = index
    assert payload["optimized_selected_fare"] == payload["candidates"][best_index]["fare"]


def test_candidate_values_match_existing_pricing() -> None:
    train_demand_model(100, 1)
    client = TestClient(app)
    payload = client.post("/pricing/decision", json={"period": 2, "remaining_capacity": 48}).json()
    optimized = optimized_decision(2, 52)
    myopic = myopic_decision(2, 52)
    assert payload["optimized_selected_fare"] == optimized.selected_fare
    assert payload["myopic_selected_fare"] == myopic.selected_fare
    assert len(payload["candidates"]) == len(optimized.candidates)
    for row, expected in zip(payload["candidates"], optimized.candidates, strict=True):
        assert row["fare"] == expected.fare
        assert abs(row["predicted_mu"] - expected.predicted_mu) < 1e-12
        assert abs(row["expected_sales"] - expected.expected_sales) < 1e-12
        assert abs(row["immediate_expected_revenue"] - expected.immediate_expected_revenue) < 1e-12
        assert abs(row["future_value"] - expected.future_value) < 1e-12
        assert abs(row["total_value"] - expected.total_value) < 1e-12


def test_period_nine_future_value_is_zero_and_policies_agree() -> None:
    client = _train()
    for remaining in (0, 25, 48, 100):
        payload = client.post(
            "/pricing/decision", json={"period": 9, "remaining_capacity": remaining}
        ).json()
        assert payload["myopic_selected_fare"] == payload["optimized_selected_fare"]
        assert abs(payload["myopic_continuation_value"]) < 1e-12
        assert abs(payload["optimized_continuation_value"]) < 1e-12
        assert abs(payload["myopic_total_policy_value"] - payload["optimized_total_policy_value"]) < 1e-9
        for row in payload["candidates"]:
            assert abs(row["future_value"]) < 1e-12
            assert abs(row["total_value"] - row["immediate_expected_revenue"]) < 1e-12


def test_decision_policy_values_are_distinct_from_bellman_myopic_action() -> None:
    train_demand_model(100, 1)
    client = TestClient(app)
    payload = client.post("/pricing/decision", json={"period": 2, "remaining_capacity": 48}).json()
    myopic = myopic_decision(2, 52)
    optimized = optimized_decision(2, 52)
    myopic_row = next(row for row in payload["candidates"] if row["fare"] == payload["myopic_selected_fare"])
    assert payload["myopic_selected_fare"] == myopic.selected_fare
    assert payload["optimized_selected_fare"] == optimized.selected_fare
    assert abs(payload["optimized_continuation_value"] - optimized.future_value) < 1e-12
    assert abs(payload["optimized_total_policy_value"] - optimized.total_value) < 1e-12
    assert abs(payload["myopic_continuation_value"] - myopic_row["future_value"]) > 1e-6
    assert abs(
        payload["myopic_total_policy_value"]
        - (payload["myopic_immediate_expected_revenue"] + payload["myopic_continuation_value"])
    ) < 1e-9


def test_zero_and_full_capacity_work() -> None:
    client = _train()
    empty = client.post("/pricing/decision", json={"period": 0, "remaining_capacity": 0}).json()
    assert empty["remaining_capacity"] == 0
    assert empty["cumulative_bookings"] == CAPACITY
    assert empty["myopic_total_policy_value"] == 0
    assert empty["optimized_total_policy_value"] == 0
    for row in empty["candidates"]:
        assert row["expected_sales"] == 0
        assert row["immediate_expected_revenue"] == 0
        assert row["total_value"] == row["future_value"]

    full = client.post("/pricing/decision", json={"period": 0, "remaining_capacity": 100}).json()
    assert full["remaining_capacity"] == 100
    assert full["cumulative_bookings"] == 0
    assert len(full["candidates"]) == 9
