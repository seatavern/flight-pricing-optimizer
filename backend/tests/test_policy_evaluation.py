from __future__ import annotations

import inspect

import numpy as np

from app.demand_model import TEST_SEED, TRAIN_SEED, train_demand_model
from app.market import CAPACITY, FARES, N_PERIODS, true_market_mean
from app.myopic import myopic_decision
from app.optimized import optimized_decision
from app.policy_evaluation import (
    EVALUATION_SEED,
    FIXED_FARES,
    STRATEGY_NAMES,
    build_myopic_policy_table,
    evaluate_policies,
    poisson_from_uniform,
    policies_do_not_observe_hidden_dgp,
    simulate_path,
)


def test_evaluation_seed_is_distinct() -> None:
    assert EVALUATION_SEED == 2026
    assert EVALUATION_SEED not in (TRAIN_SEED, TEST_SEED)
    assert list(FIXED_FARES) == [50, 60, 70, 80, 90, 100, 110, 120, 130]
    assert FARES.tolist() == list(FIXED_FARES)
    assert "Myopic" in STRATEGY_NAMES and "Optimized" in STRATEGY_NAMES


def test_policies_do_not_observe_hidden_dgp() -> None:
    assert policies_do_not_observe_hidden_dgp()
    myopic_src = inspect.getsource(myopic_decision)
    optimized_src = inspect.getsource(optimized_decision)
    for name in ("sample_strength", "true_market_mean", "period_dgp"):
        assert name not in myopic_src
        assert name not in optimized_src


def test_poisson_inverse_cdf_is_deterministic_and_nonnegative() -> None:
    first = poisson_from_uniform(8.5, 0.37)
    second = poisson_from_uniform(8.5, 0.37)
    assert first == second
    assert first >= 0
    assert poisson_from_uniform(0.0, 0.9) == 0


def test_crn_shares_uniform_but_not_realized_bookings() -> None:
    train_demand_model(8, TRAIN_SEED)
    uniforms = np.full(N_PERIODS, 0.42)
    low = simulate_path(0.2, uniforms, lambda _period, _remaining: 50)
    high = simulate_path(0.2, uniforms, lambda _period, _remaining: 130)
    assert low["fares"] == [50] * N_PERIODS
    assert high["fares"] == [130] * N_PERIODS
    assert all(sale <= CAPACITY for sale in low["sales"])
    assert sum(low["sales"]) + low["unsold"] == CAPACITY
    assert low["revenue"] == sum(fare * sale for fare, sale in zip(low["fares"], low["sales"], strict=True))
    assert low["sales"] != high["sales"] or all(
        abs(true_market_mean(50, period, 0.2) - true_market_mean(130, period, 0.2)) < 1e-12
        for period in range(N_PERIODS)
    )


def test_small_paired_evaluation_invariants() -> None:
    train_demand_model(12, TRAIN_SEED)
    result = evaluate_policies(6, EVALUATION_SEED, require_standard_model=False)
    assert result["config"]["n_flights"] == 6
    assert result["config"]["evaluation_seed"] == 2026
    assert result["config"]["fares"] == [50, 60, 70, 80, 90, 100, 110, 120, 130]
    assert len(result["table"]) == 11
    assert result["validation"]["policies_never_see_hidden_dgp"]
    assert result["validation"]["eval_seed_distinct"]
    assert abs(sum(result["fare_pct"]["myopic"].values()) - 100.0) < 1e-6
    assert abs(sum(result["fare_pct"]["optimized"].values()) - 100.0) < 1e-6
    for row in result["table"]:
        assert 0.0 <= row["mean_load_factor"] <= 1.0
        assert 0.0 <= row["sold_out_rate"] <= 1.0
        assert row["mean_unsold_seats"] >= 0.0
    myopic_policy = build_myopic_policy_table()
    assert myopic_policy.shape == (N_PERIODS, CAPACITY + 1)
    assert set(myopic_policy.ravel().tolist()).issubset(set(FIXED_FARES))
    for period, remaining in ((0, 100), (2, 48), (9, 1), (9, 20), (4, 0)):
        expected = myopic_decision(period, CAPACITY - remaining).selected_fare
        assert int(myopic_policy[period, remaining]) == expected
    assert result["validation"]["t1_optimized_matches_myopic"]
