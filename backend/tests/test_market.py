import numpy as np

from app.market import (
    ELASTICITY_MAX,
    ELASTICITY_MIN,
    EXPECTED_BOOKINGS_MAX,
    EXPECTED_BOOKINGS_MIN,
    EXPECTED_FARE_MAX,
    EXPECTED_FARE_MIN,
    FARES,
    N_PERIODS,
    period_dgp,
    sample_realized_bookings,
    sample_strength,
    true_market_mean,
)


def test_candidate_fare_grid_is_nine_values_including_fifty() -> None:
    assert FARES.tolist() == [50, 60, 70, 80, 90, 100, 110, 120, 130]


def test_period_dgp_uses_min_arrays_at_strength_zero() -> None:
    for t in range(N_PERIODS):
        dgp = period_dgp(t, 0.0)
        assert dgp.expected_fare == EXPECTED_FARE_MIN[t]
        assert dgp.expected_bookings == EXPECTED_BOOKINGS_MIN[t]
        assert dgp.elasticity == ELASTICITY_MIN[t]


def test_period_dgp_uses_max_arrays_at_strength_one() -> None:
    for t in range(N_PERIODS):
        dgp = period_dgp(t, 1.0)
        assert dgp.expected_fare == EXPECTED_FARE_MAX[t]
        assert dgp.expected_bookings == EXPECTED_BOOKINGS_MAX[t]
        assert dgp.elasticity == ELASTICITY_MAX[t]


def test_period_dgp_interpolates_at_half_strength() -> None:
    t = 6
    dgp = period_dgp(t, 0.5)
    assert dgp.expected_fare == 0.5 * EXPECTED_FARE_MAX[t] + 0.5 * EXPECTED_FARE_MIN[t]
    assert dgp.expected_bookings == 0.5 * EXPECTED_BOOKINGS_MAX[t] + 0.5 * EXPECTED_BOOKINGS_MIN[t]
    assert dgp.elasticity == 0.5 * ELASTICITY_MAX[t] + 0.5 * ELASTICITY_MIN[t]


def test_true_market_mean_matches_exact_equation() -> None:
    fare = 100.0
    period = 4
    strength = 0.25
    dgp = period_dgp(period, strength)
    numerator = dgp.expected_bookings * (
        dgp.elasticity * (fare - dgp.expected_fare) + (dgp.expected_fare + fare)
    )
    denominator = (fare + dgp.expected_fare) - dgp.elasticity * (fare - dgp.expected_fare)
    expected = max(0.0, numerator / denominator)
    assert true_market_mean(fare, period, strength) == expected


def test_true_market_mean_is_nonnegative() -> None:
    for t in range(N_PERIODS):
        mu = true_market_mean(130, t, 0.1)
        assert mu >= 0.0


def test_strength_is_clipped_to_unit_interval() -> None:
    rng = np.random.default_rng(0)
    samples = np.array([sample_strength(rng) for _ in range(5000)])
    assert samples.min() >= 0.0
    assert samples.max() <= 1.0


def test_realized_bookings_never_exceed_remaining_capacity() -> None:
    rng = np.random.default_rng(7)
    _, realized = sample_realized_bookings(rng, mu=50.0, remaining_capacity=3)
    assert realized <= 3
