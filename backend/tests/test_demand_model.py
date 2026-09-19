import numpy as np
import pytest

from app.data_generation import TARGET_NAME, generate_training_data
from app.demand_model import (
    FEATURE_NAMES,
    HIDDEN_VARIABLES,
    TEST_N_FLIGHTS,
    TEST_SEED,
    TRAIN_SEED,
    observable_feature_matrix,
    predict_mean,
    train_demand_model,
)


class _NegativePredictor:
    def predict(self, X):
        return np.full(len(X), -3.7)


def test_feature_set_is_exactly_period_fare_and_cumulative_bookings() -> None:
    data = generate_training_data(4, seed=TRAIN_SEED)
    assert data.feature_names() == ("period", "fare", "cumulative_bookings")
    assert data.feature_names() == FEATURE_NAMES
    X = observable_feature_matrix(data)
    assert X.shape == (40, 3)
    np.testing.assert_array_equal(X[:, 0], data.period)
    np.testing.assert_array_equal(X[:, 1], data.fare)
    np.testing.assert_array_equal(X[:, 2], data.cumulative_bookings)


def test_hidden_dgp_variables_cannot_enter_training_features() -> None:
    data = generate_training_data(3, seed=TRAIN_SEED)
    hidden = set(HIDDEN_VARIABLES)
    assert hidden.isdisjoint(data.feature_names())
    assert TARGET_NAME == "realized_bookings"
    assert TARGET_NAME not in data.feature_names()
    assert "flight_id" not in data.feature_names()
    X = observable_feature_matrix(data)
    assert X.shape[1] == 3
    result = train_demand_model(6, TRAIN_SEED, test_set=generate_training_data(3, seed=TEST_SEED))
    assert result.model.n_features_in_ == 3


def test_prediction_returns_finite_numeric_value() -> None:
    train_demand_model(8, TRAIN_SEED, test_set=generate_training_data(3, seed=TEST_SEED))
    predicted = predict_mean(0, 100, 0)
    assert isinstance(predicted, float)
    assert np.isfinite(predicted)


def test_prediction_is_clipped_to_nonnegative() -> None:
    predicted = predict_mean(0, 100, 0, model=_NegativePredictor())
    assert predicted == 0.0


def test_fixed_test_set_is_reproducible() -> None:
    first = generate_training_data(TEST_N_FLIGHTS, seed=TEST_SEED)
    second = generate_training_data(TEST_N_FLIGHTS, seed=TEST_SEED)
    assert len(first.realized_bookings) == 50_000
    np.testing.assert_array_equal(first.period, second.period)
    np.testing.assert_array_equal(first.fare, second.fare)
    np.testing.assert_array_equal(first.cumulative_bookings, second.cumulative_bookings)
    np.testing.assert_array_equal(first.realized_bookings, second.realized_bookings)


def test_training_and_test_seeds_are_distinct() -> None:
    assert TRAIN_SEED != TEST_SEED
    with pytest.raises(ValueError, match="distinct"):
        train_demand_model(5, TEST_SEED, test_set=generate_training_data(2, seed=TEST_SEED))


def test_metrics_are_finite_and_nonnegative() -> None:
    test_set = generate_training_data(5, seed=TEST_SEED)
    result = train_demand_model(12, TRAIN_SEED, test_set=test_set)
    assert result.n_flights == 12
    assert result.n_observations == 120
    assert np.isfinite(result.mae) and result.mae >= 0.0
    assert np.isfinite(result.rmse) and result.rmse >= 0.0
    assert np.isfinite(result.training_time_seconds) and result.training_time_seconds >= 0.0
