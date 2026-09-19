import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.stats import poisson

from app.demand_model import HIDDEN_VARIABLES, predict_mean, train_demand_model
from app.main import app
from app.market import CAPACITY, FARES, N_PERIODS
from app.myopic import DemandModelNotTrainedError, myopic_decision
from app.optimized import (
    TERMINAL_PERIOD,
    get_bellman_solution,
    optimized_decision,
    solve_bellman,
)
from app.poisson_expectation import capped_poisson_probabilities

HIDDEN_KEYS = set(HIDDEN_VARIABLES) | {"model", "diagnostics", "latentDemand", "strength"}
CANDIDATE_KEYS = {
    "fare",
    "predicted_mu",
    "expected_sales",
    "immediate_expected_revenue",
    "future_value",
    "total_value",
}


def _train_small() -> None:
    train_demand_model(100, 1)


def test_optimized_requires_trained_model() -> None:
    with pytest.raises(DemandModelNotTrainedError):
        optimized_decision(0, 0)


def test_optimized_api_requires_trained_model() -> None:
    client = TestClient(app)
    response = client.post("/pricing/optimized", json={"period": 0, "cumulative_bookings": 0})
    assert response.status_code == 409
    assert HIDDEN_KEYS.isdisjoint(response.json().keys())


def test_capped_poisson_probabilities_sum_to_one() -> None:
    for mu, capacity in ((0.0, 5), (3.2, 1), (4.5, 8), (12.0, 20), (2.0, 100)):
        probs = capped_poisson_probabilities(mu, capacity)
        assert probs.shape == (capacity + 1,)
        assert abs(float(probs.sum()) - 1.0) < 1e-12


def test_poisson_tail_is_aggregated_into_capacity() -> None:
    mu = 6.25
    capacity = 5
    probs = capped_poisson_probabilities(mu, capacity)
    for quantity in range(capacity):
        assert abs(float(probs[quantity]) - float(poisson.pmf(quantity, mu))) < 1e-12
    assert abs(float(probs[capacity]) - float(poisson.sf(capacity - 1, mu))) < 1e-12


def test_zero_capacity_is_deterministic() -> None:
    probs = capped_poisson_probabilities(8.0, 0)
    assert probs.tolist() == [1.0]


def test_terminal_value_is_zero() -> None:
    _train_small()
    solution = get_bellman_solution()
    assert solution.value.shape == (TERMINAL_PERIOD + 1, CAPACITY + 1)
    assert np.allclose(solution.value[TERMINAL_PERIOD], 0.0)
    assert TERMINAL_PERIOD == 10


def test_zero_capacity_has_zero_value() -> None:
    _train_small()
    solution = get_bellman_solution()
    assert np.allclose(solution.value[:, 0], 0.0)
    assert np.allclose(solution.action_value[:, 0, :], 0.0)
    assert np.allclose(solution.immediate_expected_revenue[:, 0, :], 0.0)
    assert np.allclose(solution.future_value[:, 0, :], 0.0)


def test_action_value_equals_immediate_plus_future() -> None:
    _train_small()
    solution = get_bellman_solution()
    reconstructed = solution.immediate_expected_revenue + solution.future_value
    assert np.allclose(solution.action_value, reconstructed, atol=1e-10)


def test_value_equals_max_candidate_total_and_policy_is_argmax() -> None:
    _train_small()
    solution = get_bellman_solution()
    fares = FARES.tolist()
    for period in range(N_PERIODS):
        for remaining in range(CAPACITY + 1):
            totals = solution.action_value[period, remaining]
            best_index = 0
            best_value = float(totals[0])
            for fare_index in range(1, totals.shape[0]):
                value = float(totals[fare_index])
                if value > best_value + 1e-9:
                    best_value = value
                    best_index = fare_index
            assert abs(float(solution.value[period, remaining]) - best_value) < 1e-9
            assert int(solution.policy[period, remaining]) == int(fares[best_index])
            assert int(solution.policy[period, remaining]) in fares


def test_predicted_mu_matches_active_model_observables_only() -> None:
    _train_small()
    solution = get_bellman_solution()
    for period in (0, 4, 9):
        for remaining in (0, 25, 100):
            cumulative = CAPACITY - remaining
            for fare_index, fare in enumerate(FARES.tolist()):
                expected = predict_mean(period, float(fare), float(cumulative))
                assert abs(float(solution.predicted_mu[period, remaining, fare_index]) - expected) < 1e-12


def test_bellman_batch_prediction_uses_only_observable_features() -> None:
    _train_small()
    seen: list[np.ndarray] = []

    from app import demand_model

    original = demand_model._clipped_predictions

    def wrapped(model, X):
        array = np.asarray(X)
        seen.append(array)
        return original(model, array)

    demand_model._clipped_predictions = wrapped  # type: ignore[method-assign]
    try:
        solve_bellman()
    finally:
        demand_model._clipped_predictions = original  # type: ignore[method-assign]

    n_grid = N_PERIODS * (CAPACITY + 1) * int(FARES.shape[0])
    bellman_grids = [grid for grid in seen if grid.ndim == 2 and grid.shape[0] == n_grid]
    assert len(bellman_grids) == 1
    grid = bellman_grids[0]
    assert grid.shape == (n_grid, 3)
    assert set(np.unique(grid[:, 0])).issubset(set(range(N_PERIODS)))
    assert set(np.unique(grid[:, 1])).issubset(set(FARES.tolist()))
    assert np.min(grid[:, 2]) >= 0
    assert np.max(grid[:, 2]) <= CAPACITY


def test_last_period_matches_myopic() -> None:
    _train_small()
    for cumulative_bookings in (0, 25, 50, 75, 100):
        optimized = optimized_decision(9, cumulative_bookings)
        myopic = myopic_decision(9, cumulative_bookings)
        assert optimized.selected_fare == myopic.selected_fare
        assert optimized.selected_fare in FARES.tolist()
        assert abs(optimized.future_value) < 1e-12


def test_optimized_api_returns_public_decision_fields() -> None:
    client = TestClient(app)
    client.post("/model/train", json={"n_flights": 100})
    response = client.post("/pricing/optimized", json={"period": 0, "cumulative_bookings": 0})
    payload = response.json()
    assert response.status_code == 200
    assert payload["selected_fare"] in FARES.tolist()
    assert set(payload.keys()) == {
        "selected_fare",
        "predicted_mu",
        "expected_sales",
        "immediate_expected_revenue",
        "future_value",
        "total_value",
        "candidates",
    }
    assert HIDDEN_KEYS.isdisjoint(payload.keys())
    assert len(payload["candidates"]) == len(FARES)
    totals = [row["total_value"] for row in payload["candidates"]]
    winner = payload["candidates"][totals.index(max(totals))]
    assert payload["selected_fare"] == winner["fare"]
    assert payload["total_value"] == winner["total_value"]
    for row in payload["candidates"]:
        assert set(row.keys()) == CANDIDATE_KEYS
        assert HIDDEN_KEYS.isdisjoint(row.keys())
        assert abs(row["total_value"] - (row["immediate_expected_revenue"] + row["future_value"])) < 1e-8
        remaining = CAPACITY
        assert 0.0 <= row["expected_sales"] <= remaining


def test_retrain_invalidates_bellman_cache() -> None:
    train_demand_model(100, 1)
    solution_one = get_bellman_solution()
    train_demand_model(100, 1)
    solution_two = get_bellman_solution()
    assert solution_two is not solution_one
    assert solution_two.model_id != solution_one.model_id
