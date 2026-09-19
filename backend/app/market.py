from __future__ import annotations

from dataclasses import dataclass

import numpy as np

CAPACITY = 100
N_PERIODS = 10
FARES = np.array([50, 60, 70, 80, 90, 100, 110, 120, 130], dtype=np.int64)

EXPECTED_FARE_MIN = np.array([60, 60, 55, 55, 50, 50, 50, 55, 65, 75], dtype=np.float64)
EXPECTED_FARE_MAX = np.array([120, 120, 120, 120, 110, 105, 100, 110, 130, 150], dtype=np.float64)
EXPECTED_BOOKINGS_MIN = np.array([2, 3, 3, 3, 4, 5, 9, 9, 7, 5], dtype=np.float64)
EXPECTED_BOOKINGS_MAX = np.array([6, 6, 8, 8, 10, 13, 16, 15, 13, 11], dtype=np.float64)
ELASTICITY_MIN = np.array([-1.8, -1.8, -1.8, -1.8, -1.8, -2.0, -2.2, -2.2, -1.7, -1.6], dtype=np.float64)
ELASTICITY_MAX = np.array([-1.4, -1.4, -1.6, -1.6, -1.7, -1.8, -1.8, -1.8, -1.5, -1.3], dtype=np.float64)


@dataclass(frozen=True)
class PeriodDgp:
    expected_fare: float
    expected_bookings: float
    elasticity: float


def sample_strength(rng: np.random.Generator) -> float:
    z = float(rng.normal(0.0, 1.0))
    return float(np.clip(z / 4.0 + 0.5, 0.0, 1.0))


def period_dgp(period: int, strength: float) -> PeriodDgp:
    if period < 0 or period >= N_PERIODS:
        raise ValueError(f"period must be in 0..{N_PERIODS - 1}, got {period}")
    s = float(strength)
    return PeriodDgp(
        expected_fare=float(EXPECTED_FARE_MAX[period] * s + EXPECTED_FARE_MIN[period] * (1.0 - s)),
        expected_bookings=float(
            EXPECTED_BOOKINGS_MAX[period] * s + EXPECTED_BOOKINGS_MIN[period] * (1.0 - s)
        ),
        elasticity=float(ELASTICITY_MAX[period] * s + ELASTICITY_MIN[period] * (1.0 - s)),
    )


def true_market_mean(fare: float, period: int, strength: float) -> float:
    dgp = period_dgp(period, strength)
    p = float(fare)
    expected_fare = dgp.expected_fare
    numerator = dgp.expected_bookings * (
        dgp.elasticity * (p - expected_fare) + (expected_fare + p)
    )
    denominator = (p + expected_fare) - dgp.elasticity * (p - expected_fare)
    if denominator == 0.0:
        return 0.0
    return float(max(0.0, numerator / denominator))


def sample_realized_bookings(
    rng: np.random.Generator,
    mu: float,
    remaining_capacity: int,
) -> tuple[int, int]:
    latent_demand = int(rng.poisson(mu))
    realized = min(latent_demand, max(0, remaining_capacity))
    return latent_demand, realized
