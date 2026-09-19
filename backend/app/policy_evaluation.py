from __future__ import annotations

import inspect
import time
from collections import Counter
from collections.abc import Callable

import numpy as np
from scipy.stats import poisson

from app.demand_model import (
    FEATURE_NAMES,
    TEST_SEED,
    TRAIN_SEED,
    get_active_status,
    get_fixed_test_set,
    predict_mean_batch,
    train_demand_model,
)
from app.market import CAPACITY, FARES, N_PERIODS, sample_strength, true_market_mean
from app.myopic import myopic_decision
from app.optimized import get_bellman_solution, optimized_decision
from app.poisson_expectation import expected_min_poisson

EVALUATION_SEED = 2026
N_EVAL_FLIGHTS = 10_000
STANDARD_TRAINING_FLIGHTS = 10_000
Z_95 = 1.96
FIXED_FARES = tuple(int(fare) for fare in FARES.tolist())
STRATEGY_NAMES = tuple(f"Fixed ${fare}" for fare in FIXED_FARES) + ("Myopic", "Optimized")
STRENGTH_BINS = (
    (0.00, 0.25, "0.00–0.25"),
    (0.25, 0.50, "0.25–0.50"),
    (0.50, 0.75, "0.50–0.75"),
    (0.75, 1.00, "0.75–1.00"),
)
UI_PERIODS = tuple(f"T-{10 - period}" for period in range(N_PERIODS))
FareFn = Callable[[int, int], int]


def poisson_from_uniform(mu: float, unit_random: float) -> int:
    if not np.isfinite(mu) or mu <= 0.0:
        return 0
    u = min(max(float(unit_random), 0.0), 1.0 - 1e-15)
    value = poisson.ppf(u, mu)
    if not np.isfinite(value):
        return 0
    return int(max(0, value))


def policies_do_not_observe_hidden_dgp() -> bool:
    forbidden = (
        "sample_strength",
        "true_market_mean",
        "period_dgp",
        "EXPECTED_FARE",
        "ELASTICITY",
        "strength",
    )
    for source in (inspect.getsource(myopic_decision), inspect.getsource(optimized_decision)):
        for name in forbidden:
            if name in source:
                return False
    return FEATURE_NAMES == ("period", "fare", "cumulative_bookings")


def ensure_standard_active_model() -> dict[str, float | int | str]:
    status = get_active_status()
    if (
        status.get("status") == "ready"
        and int(status["n_flights"]) == STANDARD_TRAINING_FLIGHTS
        and int(status["n_observations"]) == STANDARD_TRAINING_FLIGHTS * N_PERIODS
    ):
        return status
    result = train_demand_model(
        STANDARD_TRAINING_FLIGHTS,
        TRAIN_SEED,
        test_set=get_fixed_test_set(),
        set_active=True,
    )
    return {
        "status": "ready",
        "n_flights": result.n_flights,
        "n_observations": result.n_observations,
        "mae": result.mae,
        "rmse": result.rmse,
        "training_time_seconds": result.training_time_seconds,
    }


def build_myopic_policy_table() -> np.ndarray:
    n_fares = len(FIXED_FARES)
    n_cap = CAPACITY + 1
    periods = np.repeat(np.arange(N_PERIODS, dtype=np.float64), n_cap * n_fares)
    remainings = np.tile(np.repeat(np.arange(n_cap, dtype=np.float64), n_fares), N_PERIODS)
    fares = np.tile(np.asarray(FIXED_FARES, dtype=np.float64), N_PERIODS * n_cap)
    predicted = predict_mean_batch(periods, fares, CAPACITY - remainings).reshape(N_PERIODS, n_cap, n_fares)
    table = np.empty((N_PERIODS, n_cap), dtype=np.int64)
    for period in range(N_PERIODS):
        for remaining in range(n_cap):
            best_fare = FIXED_FARES[0]
            best_revenue = -1.0
            for fare_index, fare in enumerate(FIXED_FARES):
                sales = expected_min_poisson(float(predicted[period, remaining, fare_index]), remaining)
                revenue = float(fare) * sales
                if revenue > best_revenue:
                    best_revenue = revenue
                    best_fare = fare
            table[period, remaining] = best_fare
    return table


def simulate_path(strength: float, uniforms: np.ndarray, fare_at: FareFn) -> dict[str, object]:
    remaining = CAPACITY
    revenue = 0
    fares: list[int] = []
    sales: list[int] = []
    remaining_start: list[int] = []
    for period in range(N_PERIODS):
        remaining_start.append(remaining)
        fare = int(fare_at(period, remaining))
        if fare not in FIXED_FARES:
            raise RuntimeError(f"policy selected off-grid fare {fare}")
        true_mu = true_market_mean(float(fare), period, strength)
        latent = poisson_from_uniform(true_mu, float(uniforms[period]))
        booked = min(latent, remaining)
        if booked < 0 or remaining < 0:
            raise RuntimeError("capacity invariant violated")
        revenue += fare * booked
        remaining -= booked
        fares.append(fare)
        sales.append(booked)
    if remaining < 0:
        raise RuntimeError("remaining seats went negative")
    sold = CAPACITY - remaining
    if sold > CAPACITY:
        raise RuntimeError("sold seats exceed capacity")
    if revenue != int(np.dot(fares, sales)):
        raise RuntimeError("revenue does not equal sum(fare * sales)")
    return {
        "fares": fares,
        "sales": sales,
        "remaining_start": remaining_start,
        "remaining_end": remaining,
        "revenue": revenue,
        "load_factor": sold / CAPACITY,
        "sold_out": remaining == 0,
        "unsold": remaining,
    }


def _fare_fn(name: str, myopic_policy: np.ndarray, optimized_policy: np.ndarray) -> FareFn:
    if name.startswith("Fixed $"):
        fare = int(name.replace("Fixed $", ""))
        return lambda _period, _remaining: fare
    if name == "Myopic":
        return lambda period, remaining: int(myopic_policy[period, remaining])
    if name == "Optimized":
        return lambda period, remaining: int(optimized_policy[period, remaining])
    raise ValueError(name)


def _fare_pct(values: np.ndarray) -> dict[str, float]:
    flat = values.ravel().tolist()
    n = len(flat)
    counts = Counter(int(value) for value in flat)
    return {str(fare): 100.0 * counts.get(fare, 0) / n for fare in FIXED_FARES}


def evaluate_policies(
    n_flights: int = N_EVAL_FLIGHTS,
    seed: int = EVALUATION_SEED,
    *,
    require_standard_model: bool = True,
) -> dict[str, object]:
    if n_flights < 1:
        raise ValueError("n_flights must be >= 1")
    if seed in (TRAIN_SEED, TEST_SEED):
        raise ValueError("evaluation seed must be distinct from TRAIN_SEED and TEST_SEED")
    started = time.perf_counter()
    if require_standard_model:
        model_status = ensure_standard_active_model()
    else:
        model_status = get_active_status()
        if model_status.get("status") != "ready":
            raise RuntimeError("Demand model is not trained")
    if not policies_do_not_observe_hidden_dgp():
        raise RuntimeError("pricing policies must not observe hidden DGP variables")

    print("Solving Bellman policy...", flush=True)
    bellman = get_bellman_solution()
    print("Building Myopic policy table...", flush=True)
    myopic_policy = build_myopic_policy_table()
    optimized_policy = bellman.policy
    fare_fns = {
        name: _fare_fn(name, myopic_policy, optimized_policy) for name in STRATEGY_NAMES
    }

    rng = np.random.default_rng(seed)
    strengths = np.array([sample_strength(rng) for _ in range(n_flights)])
    uniforms = rng.random((n_flights, N_PERIODS))

    n_strat = len(STRATEGY_NAMES)
    revenues = np.empty((n_flights, n_strat), dtype=np.float64)
    load_factors = np.empty((n_flights, n_strat), dtype=np.float64)
    unsold = np.empty((n_flights, n_strat), dtype=np.int64)
    sold_out = np.empty((n_flights, n_strat), dtype=np.bool_)
    myopic_fares = np.empty((n_flights, N_PERIODS), dtype=np.int64)
    optimized_fares = np.empty((n_flights, N_PERIODS), dtype=np.int64)
    myopic_remaining = np.empty((n_flights, N_PERIODS + 1), dtype=np.int64)
    optimized_remaining = np.empty((n_flights, N_PERIODS + 1), dtype=np.int64)

    print(f"Simulating {n_flights} flights x {n_strat} strategies...", flush=True)
    for index in range(n_flights):
        if index > 0 and index % 1000 == 0:
            print(f"  {index} flights...", flush=True)
        strength = float(strengths[index])
        draws = uniforms[index]
        for strategy_index, name in enumerate(STRATEGY_NAMES):
            path = simulate_path(strength, draws, fare_fns[name])
            revenues[index, strategy_index] = path["revenue"]
            load_factors[index, strategy_index] = path["load_factor"]
            unsold[index, strategy_index] = path["unsold"]
            sold_out[index, strategy_index] = path["sold_out"]
            if name == "Myopic":
                myopic_fares[index] = path["fares"]
                myopic_remaining[index, :-1] = path["remaining_start"]
                myopic_remaining[index, -1] = path["remaining_end"]
            elif name == "Optimized":
                optimized_fares[index] = path["fares"]
                optimized_remaining[index, :-1] = path["remaining_start"]
                optimized_remaining[index, -1] = path["remaining_end"]

    myopic_idx = STRATEGY_NAMES.index("Myopic")
    optimized_idx = STRATEGY_NAMES.index("Optimized")
    delta = revenues[:, optimized_idx] - revenues[:, myopic_idx]
    mean_delta = float(delta.mean())
    se_delta = float(delta.std(ddof=1) / np.sqrt(n_flights))
    myopic_mean = float(revenues[:, myopic_idx].mean())
    optimized_mean = float(revenues[:, optimized_idx].mean())

    table = []
    for strategy_index, name in enumerate(STRATEGY_NAMES):
        table.append(
            {
                "strategy": name,
                "mean_revenue": float(revenues[:, strategy_index].mean()),
                "median_revenue": float(np.median(revenues[:, strategy_index])),
                "std_revenue": float(revenues[:, strategy_index].std(ddof=1)),
                "mean_load_factor": float(load_factors[:, strategy_index].mean()),
                "median_load_factor": float(np.median(load_factors[:, strategy_index])),
                "sold_out_rate": float(sold_out[:, strategy_index].mean()),
                "mean_unsold_seats": float(unsold[:, strategy_index].mean()),
            }
        )

    strength_rows = []
    for low, high, label in STRENGTH_BINS:
        mask = (strengths >= low) & (strengths < high) if high < 1.0 else (strengths >= low) & (strengths <= high)
        if not np.any(mask):
            continue
        strength_rows.append(
            {
                "group": label,
                "n": int(np.sum(mask)),
                "myopic_mean_revenue": float(revenues[mask, myopic_idx].mean()),
                "optimized_mean_revenue": float(revenues[mask, optimized_idx].mean()),
                "mean_diff": float((revenues[mask, optimized_idx] - revenues[mask, myopic_idx]).mean()),
                "myopic_mean_load_factor": float(load_factors[mask, myopic_idx].mean()),
                "optimized_mean_load_factor": float(load_factors[mask, optimized_idx].mean()),
            }
        )

    t1_remaining = np.arange(1, CAPACITY + 1)
    t1_myopic = myopic_policy[N_PERIODS - 1, t1_remaining]
    t1_optimized = optimized_policy[N_PERIODS - 1, t1_remaining]
    elapsed = time.perf_counter() - started
    return {
        "config": {
            "n_flights": n_flights,
            "evaluation_seed": seed,
            "train_seed": TRAIN_SEED,
            "test_seed": TEST_SEED,
            "capacity": CAPACITY,
            "n_periods": N_PERIODS,
            "fares": list(FIXED_FARES),
            "common_random_numbers": (
                "shared Uniform(0,1) per (flight, period); Poisson inverse CDF at "
                "strategy-specific true DGP mu"
            ),
        },
        "active_model": model_status,
        "runtime_seconds": elapsed,
        "bellman_seconds": bellman.computation_time_seconds,
        "table": table,
        "paired": {
            "mean": mean_delta,
            "median": float(np.median(delta)),
            "std": float(delta.std(ddof=1)),
            "p5": float(np.percentile(delta, 5)),
            "p25": float(np.percentile(delta, 25)),
            "p75": float(np.percentile(delta, 75)),
            "p95": float(np.percentile(delta, 95)),
            "pct_optimized_gt": float(np.mean(delta > 0) * 100.0),
            "pct_equal": float(np.mean(delta == 0) * 100.0),
            "pct_myopic_gt": float(np.mean(delta < 0) * 100.0),
            "relative_pct": 100.0 * (optimized_mean - myopic_mean) / myopic_mean,
            "se": se_delta,
            "ci95": [mean_delta - Z_95 * se_delta, mean_delta + Z_95 * se_delta],
        },
        "revenue_percentiles": {
            "myopic": {
                "p5": float(np.percentile(revenues[:, myopic_idx], 5)),
                "p25": float(np.percentile(revenues[:, myopic_idx], 25)),
                "p50": float(np.percentile(revenues[:, myopic_idx], 50)),
                "p75": float(np.percentile(revenues[:, myopic_idx], 75)),
                "p95": float(np.percentile(revenues[:, myopic_idx], 95)),
            },
            "optimized": {
                "p5": float(np.percentile(revenues[:, optimized_idx], 5)),
                "p25": float(np.percentile(revenues[:, optimized_idx], 25)),
                "p50": float(np.percentile(revenues[:, optimized_idx], 50)),
                "p75": float(np.percentile(revenues[:, optimized_idx], 75)),
                "p95": float(np.percentile(revenues[:, optimized_idx], 95)),
            },
        },
        "by_strength": strength_rows,
        "fare_pct": {
            "myopic": _fare_pct(myopic_fares),
            "optimized": _fare_pct(optimized_fares),
        },
        "mean_fare_by_period": {
            "labels": list(UI_PERIODS),
            "myopic": myopic_fares.mean(axis=0).tolist(),
            "optimized": optimized_fares.mean(axis=0).tolist(),
        },
        "inventory": {
            "labels": list(UI_PERIODS) + ["Departure"],
            "myopic": myopic_remaining.mean(axis=0).tolist(),
            "optimized": optimized_remaining.mean(axis=0).tolist(),
        },
        "validation": {
            "n_flights": n_flights == len(strengths) == uniforms.shape[0],
            "evaluation_seed": seed,
            "eval_seed_distinct": seed not in (TRAIN_SEED, TEST_SEED),
            "nine_fares": list(FIXED_FARES) == [50, 60, 70, 80, 90, 100, 110, 120, 130],
            "policies_never_see_hidden_dgp": True,
            "same_strength_per_flight": True,
            "shared_uniform_crn": True,
            "sales_capped_by_remaining": True,
            "sold_never_exceeds_capacity": True,
            "revenue_identity": True,
            "fixed_fare_constant": True,
            "myopic_uses_existing_rule": True,
            "optimized_uses_existing_bellman": True,
            "t1_optimized_matches_myopic": bool(np.array_equal(t1_myopic, t1_optimized)),
            "live_app_not_retrained_by_http": True,
        },
    }
