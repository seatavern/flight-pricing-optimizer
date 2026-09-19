from __future__ import annotations

from dataclasses import dataclass
import time

import numpy as np

from app.demand_model import get_active_model, predict_mean_batch
from app.market import CAPACITY, FARES, N_PERIODS
from app.myopic import DemandModelNotTrainedError
from app.poisson_expectation import capped_poisson_probabilities

TIE_TOLERANCE = 1e-9
TERMINAL_PERIOD = N_PERIODS

_cached_solution: BellmanSolution | None = None
_cached_model_id: int | None = None


@dataclass(frozen=True)
class BellmanSolution:
    value: np.ndarray
    policy: np.ndarray
    predicted_mu: np.ndarray
    action_value: np.ndarray
    expected_sales: np.ndarray
    immediate_expected_revenue: np.ndarray
    future_value: np.ndarray
    computation_time_seconds: float
    model_id: int


@dataclass(frozen=True)
class OptimizedCandidate:
    fare: int
    predicted_mu: float
    expected_sales: float
    immediate_expected_revenue: float
    future_value: float
    total_value: float


@dataclass(frozen=True)
class OptimizedDecision:
    selected_fare: int
    predicted_mu: float
    expected_sales: float
    immediate_expected_revenue: float
    future_value: float
    total_value: float
    candidates: tuple[OptimizedCandidate, ...]


def invalidate_optimized_cache() -> None:
    global _cached_solution, _cached_model_id
    _cached_solution = None
    _cached_model_id = None


def _argmax_lower_fare(values: np.ndarray) -> int:
    best_index = 0
    best_value = float(values[0])
    for index in range(1, values.shape[0]):
        value = float(values[index])
        if value > best_value + TIE_TOLERANCE:
            best_value = value
            best_index = index
    return best_index


def _precompute_predicted_mu(model) -> np.ndarray:
    n_fares = int(FARES.shape[0])
    n_capacity = CAPACITY + 1
    periods = np.repeat(np.arange(N_PERIODS, dtype=np.float64), n_capacity * n_fares)
    capacities = np.tile(np.repeat(np.arange(n_capacity, dtype=np.float64), n_fares), N_PERIODS)
    fares = np.tile(FARES.astype(np.float64), N_PERIODS * n_capacity)
    cumulative_bookings = (float(CAPACITY) - capacities).astype(np.float64)
    predicted = predict_mean_batch(periods, fares, cumulative_bookings, model=model)
    return predicted.reshape(N_PERIODS, n_capacity, n_fares)


def solve_bellman(model=None) -> BellmanSolution:
    fitted = model if model is not None else get_active_model()
    if fitted is None:
        raise DemandModelNotTrainedError("Demand model is not trained")

    started = time.perf_counter()
    n_fares = int(FARES.shape[0])
    n_capacity = CAPACITY + 1
    fares = [int(fare) for fare in FARES.tolist()]

    predicted_mu = _precompute_predicted_mu(fitted)
    value = np.zeros((TERMINAL_PERIOD + 1, n_capacity), dtype=np.float64)
    policy = np.full((N_PERIODS, n_capacity), fares[0], dtype=np.int64)
    action_value = np.zeros((N_PERIODS, n_capacity, n_fares), dtype=np.float64)
    expected_sales = np.zeros((N_PERIODS, n_capacity, n_fares), dtype=np.float64)
    immediate_expected_revenue = np.zeros((N_PERIODS, n_capacity, n_fares), dtype=np.float64)
    future_value = np.zeros((N_PERIODS, n_capacity, n_fares), dtype=np.float64)

    for period in range(N_PERIODS - 1, -1, -1):
        next_value = value[period + 1]
        for remaining in range(n_capacity):
            if remaining == 0:
                policy[period, 0] = fares[0]
                continue
            quantities = np.arange(remaining + 1, dtype=np.float64)
            continuation = next_value[remaining - np.arange(remaining + 1)]
            for fare_index, fare in enumerate(fares):
                mu = float(predicted_mu[period, remaining, fare_index])
                probabilities = capped_poisson_probabilities(mu, remaining)
                sales = float(np.dot(probabilities, quantities))
                immediate = float(fare) * sales
                future = float(np.dot(probabilities, continuation))
                total = immediate + future
                expected_sales[period, remaining, fare_index] = sales
                immediate_expected_revenue[period, remaining, fare_index] = immediate
                future_value[period, remaining, fare_index] = future
                action_value[period, remaining, fare_index] = total
            best_index = _argmax_lower_fare(action_value[period, remaining])
            value[period, remaining] = action_value[period, remaining, best_index]
            policy[period, remaining] = fares[best_index]

    return BellmanSolution(
        value=value,
        policy=policy,
        predicted_mu=predicted_mu,
        action_value=action_value,
        expected_sales=expected_sales,
        immediate_expected_revenue=immediate_expected_revenue,
        future_value=future_value,
        computation_time_seconds=time.perf_counter() - started,
        model_id=id(fitted),
    )


def get_bellman_solution() -> BellmanSolution:
    global _cached_solution, _cached_model_id
    fitted = get_active_model()
    if fitted is None:
        raise DemandModelNotTrainedError("Demand model is not trained")
    model_id = id(fitted)
    if _cached_solution is not None and _cached_model_id == model_id:
        return _cached_solution
    solution = solve_bellman(fitted)
    _cached_solution = solution
    _cached_model_id = model_id
    return solution


def _candidate_at(solution: BellmanSolution, period: int, remaining: int, fare_index: int) -> OptimizedCandidate:
    return OptimizedCandidate(
        fare=int(FARES[fare_index]),
        predicted_mu=float(solution.predicted_mu[period, remaining, fare_index]),
        expected_sales=float(solution.expected_sales[period, remaining, fare_index]),
        immediate_expected_revenue=float(solution.immediate_expected_revenue[period, remaining, fare_index]),
        future_value=float(solution.future_value[period, remaining, fare_index]),
        total_value=float(solution.action_value[period, remaining, fare_index]),
    )


def optimized_decision(period: int, cumulative_bookings: int) -> OptimizedDecision:
    if period < 0 or period >= N_PERIODS:
        raise ValueError(f"period must be in 0..{N_PERIODS - 1}")
    if cumulative_bookings < 0:
        raise ValueError("cumulative_bookings must be >= 0")

    remaining = max(0, CAPACITY - int(cumulative_bookings))
    solution = get_bellman_solution()
    candidates = tuple(
        _candidate_at(solution, period, remaining, fare_index)
        for fare_index in range(int(FARES.shape[0]))
    )
    selected_fare = int(solution.policy[period, remaining])
    selected = next(row for row in candidates if row.fare == selected_fare)
    return OptimizedDecision(
        selected_fare=selected.fare,
        predicted_mu=selected.predicted_mu,
        expected_sales=selected.expected_sales,
        immediate_expected_revenue=selected.immediate_expected_revenue,
        future_value=selected.future_value,
        total_value=selected.total_value,
        candidates=candidates,
    )


def optimized_payload(decision: OptimizedDecision) -> dict[str, object]:
    return {
        "selected_fare": decision.selected_fare,
        "predicted_mu": decision.predicted_mu,
        "expected_sales": decision.expected_sales,
        "immediate_expected_revenue": decision.immediate_expected_revenue,
        "future_value": decision.future_value,
        "total_value": decision.total_value,
        "candidates": [
            {
                "fare": row.fare,
                "predicted_mu": row.predicted_mu,
                "expected_sales": row.expected_sales,
                "immediate_expected_revenue": row.immediate_expected_revenue,
                "future_value": row.future_value,
                "total_value": row.total_value,
            }
            for row in decision.candidates
        ],
    }
