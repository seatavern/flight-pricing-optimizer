from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.market import (
    CAPACITY,
    FARES,
    N_PERIODS,
    period_dgp,
    sample_realized_bookings,
    sample_strength,
    true_market_mean,
)

OBSERVABLE_FEATURES = ("period", "fare", "cumulative_bookings")
TARGET_NAME = "realized_bookings"


@dataclass(frozen=True)
class TrainingDataset:
    period: np.ndarray
    fare: np.ndarray
    cumulative_bookings: np.ndarray
    realized_bookings: np.ndarray
    diagnostics: dict[str, np.ndarray]

    def feature_names(self) -> tuple[str, ...]:
        return OBSERVABLE_FEATURES

    def feature_matrix(self) -> np.ndarray:
        return np.column_stack(
            (self.period, self.fare, self.cumulative_bookings)
        )


def generate_training_data(
    n_flights: int,
    seed: int | None = None,
    rng: np.random.Generator | None = None,
) -> TrainingDataset:
    if n_flights < 0:
        raise ValueError("n_flights must be >= 0")
    if rng is None:
        rng = np.random.default_rng(seed)

    n_rows = n_flights * N_PERIODS
    period = np.empty(n_rows, dtype=np.int64)
    fare = np.empty(n_rows, dtype=np.int64)
    cumulative_bookings = np.empty(n_rows, dtype=np.int64)
    realized_bookings = np.empty(n_rows, dtype=np.int64)

    strength = np.empty(n_rows, dtype=np.float64)
    expected_fare = np.empty(n_rows, dtype=np.float64)
    expected_bookings = np.empty(n_rows, dtype=np.float64)
    elasticity = np.empty(n_rows, dtype=np.float64)
    mu = np.empty(n_rows, dtype=np.float64)
    latent_demand = np.empty(n_rows, dtype=np.int64)

    row = 0
    for _ in range(n_flights):
        flight_strength = sample_strength(rng)
        already_booked = 0
        for t in range(N_PERIODS):
            chosen_fare = int(rng.choice(FARES))
            remaining = CAPACITY - already_booked
            dgp = period_dgp(t, flight_strength)
            true_mu = true_market_mean(chosen_fare, t, flight_strength)
            latent, realized = sample_realized_bookings(rng, true_mu, remaining)

            period[row] = t
            fare[row] = chosen_fare
            cumulative_bookings[row] = already_booked
            realized_bookings[row] = realized

            strength[row] = flight_strength
            expected_fare[row] = dgp.expected_fare
            expected_bookings[row] = dgp.expected_bookings
            elasticity[row] = dgp.elasticity
            mu[row] = true_mu
            latent_demand[row] = latent

            already_booked += realized
            row += 1

    return TrainingDataset(
        period=period,
        fare=fare,
        cumulative_bookings=cumulative_bookings,
        realized_bookings=realized_bookings,
        diagnostics={
            "strength": strength,
            "expected_fare": expected_fare,
            "expected_bookings": expected_bookings,
            "elasticity": elasticity,
            "mu": mu,
            "latent_demand": latent_demand,
        },
    )
