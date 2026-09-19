from __future__ import annotations

from dataclasses import dataclass
import time

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

from app.data_generation import OBSERVABLE_FEATURES, TARGET_NAME, TrainingDataset, generate_training_data
from app.market import FARES, N_PERIODS

FEATURE_NAMES = OBSERVABLE_FEATURES
HIDDEN_VARIABLES = (
    "strength",
    "expectedFare",
    "expected_fare",
    "expectedBookings",
    "expected_bookings",
    "elasticity",
    "mu",
    "true mu",
    "latent_demand",
    "flight_id",
)

TRAIN_SEED = 1
TEST_SEED = 99
TEST_N_FLIGHTS = 5_000
TRAINING_SIZES = (100, 1_000, 5_000, 10_000)
REPRESENTATIVE_STATES = (
    (0, 0),
    (4, 25),
    (7, 50),
)

_active_model: HistGradientBoostingRegressor | None = None
_active_metadata: ActiveModelMetadata | None = None
_fixed_test_set: TrainingDataset | None = None


@dataclass(frozen=True)
class ActiveModelMetadata:
    n_flights: int
    n_observations: int
    mae: float
    rmse: float
    training_time_seconds: float


@dataclass(frozen=True)
class TrainingResult:
    n_flights: int
    n_observations: int
    mae: float
    rmse: float
    training_time_seconds: float
    model: HistGradientBoostingRegressor


def get_active_model() -> HistGradientBoostingRegressor | None:
    return _active_model


def set_active_model(
    model: HistGradientBoostingRegressor | None,
    metadata: ActiveModelMetadata | None = None,
) -> None:
    global _active_model, _active_metadata
    _active_model = model
    _active_metadata = None if model is None else metadata
    from app.optimized import invalidate_optimized_cache
    from app.myopic_evaluation import invalidate_myopic_evaluation_cache

    invalidate_optimized_cache()
    invalidate_myopic_evaluation_cache()


def public_training_payload(result: TrainingResult) -> dict[str, float | int | str]:
    return {
        "status": "ready",
        "n_flights": result.n_flights,
        "n_observations": result.n_observations,
        "mae": result.mae,
        "rmse": result.rmse,
        "training_time_seconds": result.training_time_seconds,
    }


def get_active_status() -> dict[str, float | int | str]:
    if _active_model is None or _active_metadata is None:
        return {"status": "not_trained"}
    return {
        "status": "ready",
        "n_flights": _active_metadata.n_flights,
        "n_observations": _active_metadata.n_observations,
        "mae": _active_metadata.mae,
        "rmse": _active_metadata.rmse,
        "training_time_seconds": _active_metadata.training_time_seconds,
    }


def observable_feature_matrix(dataset: TrainingDataset) -> np.ndarray:
    names = dataset.feature_names()
    if names != FEATURE_NAMES:
        raise ValueError(f"deployable features must be {FEATURE_NAMES}, got {names}")
    if TARGET_NAME in names:
        raise ValueError("target must not be included in the feature matrix")
    if not set(HIDDEN_VARIABLES).isdisjoint(names):
        raise ValueError("hidden DGP variables must not enter X")
    X = dataset.feature_matrix()
    if X.ndim != 2 or X.shape[1] != len(FEATURE_NAMES):
        raise ValueError("feature matrix must have exactly 3 columns")
    return X


def get_fixed_test_set() -> TrainingDataset:
    global _fixed_test_set
    if _fixed_test_set is None:
        _fixed_test_set = generate_training_data(TEST_N_FLIGHTS, seed=TEST_SEED)
    return _fixed_test_set


def _clipped_predictions(model: HistGradientBoostingRegressor, X: np.ndarray) -> np.ndarray:
    raw = np.asarray(model.predict(X), dtype=np.float64)
    return np.maximum(0.0, raw)


def evaluate_model(model: HistGradientBoostingRegressor, test_set: TrainingDataset) -> tuple[float, float]:
    X_test = observable_feature_matrix(test_set)
    y_test = np.asarray(test_set.realized_bookings, dtype=np.float64)
    y_pred = _clipped_predictions(model, X_test)
    mae = float(mean_absolute_error(y_test, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    return mae, rmse


def train_demand_model(
    n_flights: int,
    seed: int,
    *,
    test_set: TrainingDataset | None = None,
    set_active: bool = True,
) -> TrainingResult:
    if n_flights < 1:
        raise ValueError("n_flights must be >= 1")
    if seed == TEST_SEED:
        raise ValueError("training seed must be distinct from the fixed test seed")

    train_set = generate_training_data(n_flights, seed=seed)
    X_train = observable_feature_matrix(train_set)
    y_train = np.asarray(train_set.realized_bookings, dtype=np.float64)

    model = HistGradientBoostingRegressor(random_state=seed)
    started = time.perf_counter()
    model.fit(X_train, y_train)
    training_time_seconds = time.perf_counter() - started

    held_out = test_set if test_set is not None else get_fixed_test_set()
    mae, rmse = evaluate_model(model, held_out)

    n_observations = n_flights * N_PERIODS
    metadata = ActiveModelMetadata(
        n_flights=n_flights,
        n_observations=n_observations,
        mae=mae,
        rmse=rmse,
        training_time_seconds=training_time_seconds,
    )
    if set_active:
        set_active_model(model, metadata)

    return TrainingResult(
        n_flights=n_flights,
        n_observations=n_observations,
        mae=mae,
        rmse=rmse,
        training_time_seconds=training_time_seconds,
        model=model,
    )


def predict_mean(
    period: float,
    fare: float,
    cumulative_bookings: float,
    model: HistGradientBoostingRegressor | None = None,
) -> float:
    fitted = model if model is not None else get_active_model()
    if fitted is None:
        raise RuntimeError("No demand model is fitted")
    X = np.array([[period, fare, cumulative_bookings]], dtype=np.float64)
    predicted_mu = float(_clipped_predictions(fitted, X)[0])
    if not np.isfinite(predicted_mu):
        raise RuntimeError("Demand prediction is not finite")
    return predicted_mu


def predict_mean_batch(
    periods: np.ndarray,
    fares: np.ndarray,
    cumulative_bookings: np.ndarray,
    model: HistGradientBoostingRegressor | None = None,
) -> np.ndarray:
    fitted = model if model is not None else get_active_model()
    if fitted is None:
        raise RuntimeError("No demand model is fitted")
    X = np.column_stack(
        [
            np.asarray(periods, dtype=np.float64),
            np.asarray(fares, dtype=np.float64),
            np.asarray(cumulative_bookings, dtype=np.float64),
        ]
    )
    if X.ndim != 2 or X.shape[1] != len(FEATURE_NAMES):
        raise ValueError("batch feature matrix must have exactly 3 columns")
    predicted = _clipped_predictions(fitted, X)
    if not np.all(np.isfinite(predicted)):
        raise RuntimeError("Demand prediction is not finite")
    return predicted



def price_response_diagnostic(
    model: HistGradientBoostingRegressor | None = None,
    states: tuple[tuple[int, int], ...] = REPRESENTATIVE_STATES,
) -> list[dict[str, float | int]]:
    fitted = model if model is not None else get_active_model()
    if fitted is None:
        raise RuntimeError("No demand model is fitted")
    rows: list[dict[str, float | int]] = []
    for period, cumulative_bookings in states:
        for fare in FARES.tolist():
            rows.append(
                {
                    "period": int(period),
                    "cumulative_bookings": int(cumulative_bookings),
                    "fare": int(fare),
                    "predicted_mu": predict_mean(period, fare, cumulative_bookings, model=fitted),
                }
            )
    return rows


def run_training_size_experiment(
    sizes: tuple[int, ...] = TRAINING_SIZES,
    train_seed: int = TRAIN_SEED,
    test_set: TrainingDataset | None = None,
) -> list[TrainingResult]:
    held_out = test_set if test_set is not None else get_fixed_test_set()
    results = [
        train_demand_model(n_flights, train_seed, test_set=held_out, set_active=True)
        for n_flights in sizes
    ]
    return results
