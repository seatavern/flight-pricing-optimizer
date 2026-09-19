from fastapi.testclient import TestClient

from app.demand_model import HIDDEN_VARIABLES, train_demand_model
from app.main import app
from app.market import CAPACITY, N_PERIODS
from app.myopic import myopic_decision
from app.myopic_evaluation import get_myopic_policy_value
from app.optimized import get_bellman_solution, optimized_decision

HIDDEN_KEYS = set(HIDDEN_VARIABLES) | {"model", "diagnostics", "latentDemand", "strength", "mu"}
STATE_KEYS = {
    "period",
    "remaining_capacity",
    "myopic_fare",
    "optimized_fare",
    "fare_difference",
}


def _train() -> TestClient:
    client = TestClient(app)
    client.post("/model/train", json={"n_flights": 100})
    return client


def test_policy_map_requires_trained_model() -> None:
    client = TestClient(app)
    response = client.get("/pricing/policy-map")
    assert response.status_code == 409
    assert HIDDEN_KEYS.isdisjoint(response.json().keys())


def test_policy_map_covers_full_state_space() -> None:
    client = _train()
    payload = client.get("/pricing/policy-map").json()
    assert set(payload.keys()) == {"states"}
    states = payload["states"]
    assert len(states) == N_PERIODS * (CAPACITY + 1)
    periods = {row["period"] for row in states}
    remaining = {row["remaining_capacity"] for row in states}
    assert periods == set(range(N_PERIODS))
    assert remaining == set(range(CAPACITY + 1))
    assert HIDDEN_KEYS.isdisjoint(payload.keys())
    for row in states:
        assert set(row.keys()) == STATE_KEYS
        assert HIDDEN_KEYS.isdisjoint(row.keys())
        assert row["fare_difference"] == row["optimized_fare"] - row["myopic_fare"]


def test_policy_map_fares_match_existing_policies() -> None:
    train_demand_model(100, 1)
    client = TestClient(app)
    payload = client.get("/pricing/policy-map").json()
    myopic_eval = get_myopic_policy_value()
    bellman = get_bellman_solution()
    by_state = {(row["period"], row["remaining_capacity"]): row for row in payload["states"]}
    samples = (
        (0, 1),
        (2, 48),
        (4, 60),
        (8, 25),
        (9, 1),
        (9, 100),
        (0, 0),
        (9, 0),
    )
    for period, remaining in samples:
        row = by_state[(period, remaining)]
        expected_myopic = myopic_decision(period, CAPACITY - remaining).selected_fare
        expected_optimized = optimized_decision(period, CAPACITY - remaining).selected_fare
        assert row["myopic_fare"] == expected_myopic
        assert row["optimized_fare"] == expected_optimized
        assert row["myopic_fare"] == int(myopic_eval.policy[period, remaining])
        assert row["optimized_fare"] == int(bellman.policy[period, remaining])


def test_period_nine_policies_agree_when_inventory_remains() -> None:
    client = _train()
    payload = client.get("/pricing/policy-map").json()
    for row in payload["states"]:
        if row["period"] != 9 or row["remaining_capacity"] == 0:
            continue
        assert row["myopic_fare"] == row["optimized_fare"]
        assert row["fare_difference"] == 0


def test_known_explorer_state_matches_decision_tables() -> None:
    train_demand_model(100, 1)
    client = TestClient(app)
    payload = client.get("/pricing/policy-map").json()
    row = next(
        item for item in payload["states"] if item["period"] == 2 and item["remaining_capacity"] == 48
    )
    myopic = myopic_decision(2, 52)
    optimized = optimized_decision(2, 52)
    assert row["myopic_fare"] == myopic.selected_fare
    assert row["optimized_fare"] == optimized.selected_fare
    assert row["fare_difference"] == optimized.selected_fare - myopic.selected_fare


def test_policy_map_does_not_use_hidden_dgp() -> None:
    import inspect

    from app import policy_map

    source = inspect.getsource(policy_map)
    forbidden = (
        "period_dgp",
        "true_market_mean",
        "sample_strength",
        "EXPECTED_FARE_MIN",
        "ELASTICITY_MIN",
        "sample_realized_bookings",
        "myopic_total_policy_value",
        "continuation_value",
    )
    for name in forbidden:
        assert name not in source


def test_zero_capacity_is_returned_without_changing_policy() -> None:
    train_demand_model(100, 1)
    client = TestClient(app)
    payload = client.get("/pricing/policy-map").json()
    myopic_eval = get_myopic_policy_value()
    bellman = get_bellman_solution()
    for period in range(N_PERIODS):
        row = next(
            item
            for item in payload["states"]
            if item["period"] == period and item["remaining_capacity"] == 0
        )
        assert row["myopic_fare"] == int(myopic_eval.policy[period, 0])
        assert row["optimized_fare"] == int(bellman.policy[period, 0])
        assert row["fare_difference"] == row["optimized_fare"] - row["myopic_fare"]
