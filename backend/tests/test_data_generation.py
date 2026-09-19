import numpy as np

from app.data_generation import OBSERVABLE_FEATURES, TARGET_NAME, generate_training_data
from app.market import CAPACITY, FARES, N_PERIODS, period_dgp, true_market_mean


def test_exactly_ten_rows_per_flight() -> None:
    data = generate_training_data(7, seed=1)
    assert len(data.period) == 7 * N_PERIODS
    assert len(data.realized_bookings) == 7 * 10


def test_strength_is_constant_within_one_flight() -> None:
    data = generate_training_data(5, seed=2)
    strengths = data.diagnostics["strength"].reshape(5, N_PERIODS)
    for flight_strengths in strengths:
        assert np.all(flight_strengths == flight_strengths[0])


def test_fares_are_from_allowed_grid() -> None:
    data = generate_training_data(20, seed=3)
    assert set(np.unique(data.fare)).issubset(set(FARES.tolist()))


def test_observable_features_are_only_period_fare_and_cumulative_bookings() -> None:
    data = generate_training_data(3, seed=4)
    assert data.feature_names() == ("period", "fare", "cumulative_bookings")
    assert data.feature_names() == OBSERVABLE_FEATURES
    matrix = data.feature_matrix()
    assert matrix.shape == (30, 3)
    np.testing.assert_array_equal(matrix[:, 0], data.period)
    np.testing.assert_array_equal(matrix[:, 1], data.fare)
    np.testing.assert_array_equal(matrix[:, 2], data.cumulative_bookings)
    hidden = {"strength", "expected_fare", "expected_bookings", "elasticity", "mu"}
    assert hidden.isdisjoint(data.feature_names())
    assert TARGET_NAME == "realized_bookings"
    assert TARGET_NAME not in data.feature_names()


def test_cumulative_bookings_never_exceed_capacity() -> None:
    data = generate_training_data(25, seed=5)
    assert np.all(data.cumulative_bookings <= CAPACITY)
    final_by_flight = (
        data.cumulative_bookings.reshape(25, N_PERIODS)[:, -1]
        + data.realized_bookings.reshape(25, N_PERIODS)[:, -1]
    )
    assert np.all(final_by_flight <= CAPACITY)


def test_realized_bookings_never_exceed_remaining_capacity() -> None:
    data = generate_training_data(25, seed=6)
    remaining = CAPACITY - data.cumulative_bookings
    assert np.all(data.realized_bookings <= remaining)
    assert np.all(data.realized_bookings >= 0)


def test_identical_seeds_reproduce_identical_data() -> None:
    first = generate_training_data(8, seed=11)
    second = generate_training_data(8, seed=11)
    np.testing.assert_array_equal(first.period, second.period)
    np.testing.assert_array_equal(first.fare, second.fare)
    np.testing.assert_array_equal(first.cumulative_bookings, second.cumulative_bookings)
    np.testing.assert_array_equal(first.realized_bookings, second.realized_bookings)
    np.testing.assert_array_equal(first.diagnostics["strength"], second.diagnostics["strength"])
    np.testing.assert_array_equal(first.diagnostics["mu"], second.diagnostics["mu"])


def test_different_seeds_change_generated_data() -> None:
    first = generate_training_data(8, seed=11)
    second = generate_training_data(8, seed=12)
    assert not np.array_equal(first.realized_bookings, second.realized_bookings) or not np.array_equal(
        first.fare, second.fare
    )


def test_periods_use_correct_dgp_parameters() -> None:
    data = generate_training_data(4, seed=9)
    for i in range(len(data.period)):
        t = int(data.period[i])
        s = float(data.diagnostics["strength"][i])
        dgp = period_dgp(t, s)
        assert data.diagnostics["expected_fare"][i] == dgp.expected_fare
        assert data.diagnostics["expected_bookings"][i] == dgp.expected_bookings
        assert data.diagnostics["elasticity"][i] == dgp.elasticity
        assert data.diagnostics["mu"][i] == true_market_mean(float(data.fare[i]), t, s)


def test_cumulative_bookings_are_pre_period_totals() -> None:
    data = generate_training_data(6, seed=13)
    by_flight_cum = data.cumulative_bookings.reshape(6, N_PERIODS)
    by_flight_realized = data.realized_bookings.reshape(6, N_PERIODS)
    assert np.all(by_flight_cum[:, 0] == 0)
    for flight in range(6):
        running = 0
        for t in range(N_PERIODS):
            assert by_flight_cum[flight, t] == running
            running += int(by_flight_realized[flight, t])
