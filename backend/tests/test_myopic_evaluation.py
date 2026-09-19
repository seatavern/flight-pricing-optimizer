import numpy as np
from fastapi.testclient import TestClient

from app.demand_model import HIDDEN_VARIABLES, train_demand_model
from app.main import app
from app.market import CAPACITY, FARES, N_PERIODS
from app.myopic import myopic_decision
from app.myopic_evaluation import get_myopic_policy_value
from app.optimized import get_bellman_solution, optimized_decision
from app.poisson_expectation import capped_poisson_probabilities

HIDDEN_KEYS = set(HIDDEN_VARIABLES) | {"model", "diagnostics", "latentDemand", "strength", "mu"}


def _train() -> None:
    train_demand_model(100, 1)


def test_myopic_policy_uses_existing_decision_rule_everywhere() -> None:
    _train()
    evaluation = get_myopic_policy_value()
    for period in (0, 2, 4, 9):
        for remaining in (0, 1, 25, 48, 100):
            expected = myopic_decision(period, CAPACITY - remaining).selected_fare
            assert int(evaluation.policy[period, remaining]) == expected


def test_myopic_policy_value_matches_immediate_plus_continuation() -> None:
    _train()
    evaluation = get_myopic_policy_value()
    reconstructed = evaluation.immediate_expected_revenue + evaluation.continuation_value
    assert np.allclose(evaluation.value[:N_PERIODS], reconstructed, atol=1e-10)
    assert np.allclose(evaluation.value[N_PERIODS], 0.0)


def test_myopic_continuation_is_expectation_of_v_m_not_v_star() -> None:
    _train()
    evaluation = get_myopic_policy_value()
    bellman = get_bellman_solution()
    period = 2
    remaining = 48
    fare = int(evaluation.policy[period, remaining])
    mu = float(evaluation.predicted_mu[period, remaining])
    probabilities = capped_poisson_probabilities(mu, remaining)
    expected_continuation = float(
        np.dot(probabilities, evaluation.value[period + 1, remaining - np.arange(remaining + 1)])
    )
    assert abs(float(evaluation.continuation_value[period, remaining]) - expected_continuation) < 1e-9

    fare_index = FARES.tolist().index(fare)
    bellman_continuation = float(bellman.future_value[period, remaining, fare_index])
    assert abs(float(evaluation.continuation_value[period, remaining]) - bellman_continuation) > 1e-6


def test_period_nine_myopic_continuation_is_zero() -> None:
    _train()
    evaluation = get_myopic_policy_value()
    assert np.allclose(evaluation.continuation_value[9], 0.0)
    assert np.allclose(evaluation.value[9], evaluation.immediate_expected_revenue[9])


def test_zero_capacity_myopic_policy_values_are_zero() -> None:
    _train()
    evaluation = get_myopic_policy_value()
    assert np.allclose(evaluation.value[:, 0], 0.0)
    assert np.allclose(evaluation.immediate_expected_revenue[:, 0], 0.0)
    assert np.allclose(evaluation.continuation_value[:, 0], 0.0)


def test_retrain_invalidates_myopic_and_bellman_caches() -> None:
    train_demand_model(100, 1)
    myopic_one = get_myopic_policy_value()
    bellman_one = get_bellman_solution()
    train_demand_model(100, 1)
    myopic_two = get_myopic_policy_value()
    bellman_two = get_bellman_solution()
    assert myopic_two is not myopic_one
    assert bellman_two is not bellman_one
    assert myopic_two.model_id != myopic_one.model_id
    assert bellman_two.model_id != bellman_one.model_id


def test_myopic_evaluation_does_not_use_hidden_dgp() -> None:
    import inspect

    from app import decision, myopic_evaluation

    source = inspect.getsource(myopic_evaluation) + inspect.getsource(decision)
    forbidden = (
        "period_dgp",
        "true_market_mean",
        "sample_strength",
        "EXPECTED_FARE_MIN",
        "ELASTICITY_MIN",
        "sample_realized_bookings",
    )
    for name in forbidden:
        assert name not in source
    client = TestClient(app)
    client.post("/model/train", json={"n_flights": 100})
    payload = client.post("/pricing/decision", json={"period": 2, "remaining_capacity": 48}).json()
    assert HIDDEN_KEYS.isdisjoint(payload.keys())
    for row in payload["candidates"]:
        assert HIDDEN_KEYS.isdisjoint(row.keys())
