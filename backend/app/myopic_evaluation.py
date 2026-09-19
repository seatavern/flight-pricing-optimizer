from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.demand_model import get_active_model, predict_mean_batch
from app.market import CAPACITY, FARES, N_PERIODS
from app.myopic import DemandModelNotTrainedError
from app.poisson_expectation import capped_poisson_probabilities, expected_min_poisson

TERMINAL_PERIOD = N_PERIODS

_cached_solution: MyopicPolicyValue | None = None
_cached_model_id: int | None = None


@dataclass(frozen=True)
class MyopicPolicyValue:
    value: np.ndarray
    policy: np.ndarray
    predicted_mu: np.ndarray
    immediate_expected_revenue: np.ndarray
    continuation_value: np.ndarray
    model_id: int


def invalidate_myopic_evaluation_cache() -> None:
    global _cached_solution, _cached_model_id
    _cached_solution = None
    _cached_model_id = None


def _precompute_predicted_mu(model) -> np.ndarray:
    n_fares = int(FARES.shape[0])
    n_capacity = CAPACITY + 1
    periods = np.repeat(np.arange(N_PERIODS, dtype=np.float64), n_capacity * n_fares)
    capacities = np.tile(np.repeat(np.arange(n_capacity, dtype=np.float64), n_fares), N_PERIODS)
    fares = np.tile(FARES.astype(np.float64), N_PERIODS * n_capacity)
    cumulative_bookings = (float(CAPACITY) - capacities).astype(np.float64)
    predicted = predict_mean_batch(periods, fares, cumulative_bookings, model=model)
    return predicted.reshape(N_PERIODS, n_capacity, n_fares)


def _myopic_fare_index(predicted_by_fare: np.ndarray, remaining: int) -> int:
    """Same selection as myopic_decision: argmax_p p * E[min(D, c)], first max wins."""
    best_index = 0
    best_revenue = float("-inf")
    for fare_index, fare in enumerate(FARES.tolist()):
        mu = float(predicted_by_fare[fare_index])
        revenue = float(fare) * expected_min_poisson(mu, remaining)
        if revenue > best_revenue:
            best_revenue = revenue
            best_index = fare_index
    return best_index


def solve_myopic_policy_value(model=None) -> MyopicPolicyValue:
    fitted = model if model is not None else get_active_model()
    if fitted is None:
        raise DemandModelNotTrainedError("Demand model is not trained")

    n_capacity = CAPACITY + 1
    predicted_all = _precompute_predicted_mu(fitted)
    value = np.zeros((TERMINAL_PERIOD + 1, n_capacity), dtype=np.float64)
    policy = np.zeros((N_PERIODS, n_capacity), dtype=np.int64)
    predicted_mu = np.zeros((N_PERIODS, n_capacity), dtype=np.float64)
    immediate = np.zeros((N_PERIODS, n_capacity), dtype=np.float64)
    continuation = np.zeros((N_PERIODS, n_capacity), dtype=np.float64)

    for period in range(N_PERIODS):
        for remaining in range(n_capacity):
            fare_index = _myopic_fare_index(predicted_all[period, remaining], remaining)
            policy[period, remaining] = int(FARES[fare_index])
            predicted_mu[period, remaining] = float(predicted_all[period, remaining, fare_index])

    for period in range(N_PERIODS - 1, -1, -1):
        next_value = value[period + 1]
        for remaining in range(1, n_capacity):
            fare = int(policy[period, remaining])
            mu = float(predicted_mu[period, remaining])
            probabilities = capped_poisson_probabilities(mu, remaining)
            quantities = np.arange(remaining + 1, dtype=np.float64)
            sales = float(np.dot(probabilities, quantities))
            immediate_revenue = float(fare) * sales
            future = float(np.dot(probabilities, next_value[remaining - np.arange(remaining + 1)]))
            immediate[period, remaining] = immediate_revenue
            continuation[period, remaining] = future
            value[period, remaining] = immediate_revenue + future

    return MyopicPolicyValue(
        value=value,
        policy=policy,
        predicted_mu=predicted_mu,
        immediate_expected_revenue=immediate,
        continuation_value=continuation,
        model_id=id(fitted),
    )


def get_myopic_policy_value() -> MyopicPolicyValue:
    global _cached_solution, _cached_model_id
    fitted = get_active_model()
    if fitted is None:
        raise DemandModelNotTrainedError("Demand model is not trained")
    model_id = id(fitted)
    if _cached_solution is not None and _cached_model_id == model_id:
        return _cached_solution
    solution = solve_myopic_policy_value(fitted)
    _cached_solution = solution
    _cached_model_id = model_id
    return solution
