"""Azure-compatible training entry point for the existing demand model.

CODE FOLDER in Azure ML Studio: backend
COMMAND: python azure/train.py
ENVIRONMENT: azure/conda.yaml
OUTPUT: outputs/demand_model.joblib
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import joblib
import mlflow
import numpy as np

from app.data_generation import generate_training_data
from app.demand_model import (
    FEATURE_NAMES,
    TEST_N_FLIGHTS,
    TEST_SEED,
    TRAIN_SEED,
    predict_mean,
    train_demand_model,
)
from app.market import N_PERIODS

DEFAULT_TRAINING_FLIGHTS = 10_000
ALGORITHM = "HistGradientBoostingRegressor"
MODEL_FILENAME = "demand_model.joblib"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the synthetic-market demand model.")
    parser.add_argument("--training-flights", type=int, default=DEFAULT_TRAINING_FLIGHTS)
    parser.add_argument("--train-seed", type=int, default=TRAIN_SEED)
    parser.add_argument("--test-seed", type=int, default=TEST_SEED)
    return parser.parse_args()


def output_dir() -> Path:
    path = Path.cwd() / "outputs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def main() -> None:
    args = parse_args()
    if args.training_flights < 1:
        raise SystemExit("--training-flights must be >= 1")

    test_set = generate_training_data(TEST_N_FLIGHTS, seed=args.test_seed)
    result = train_demand_model(
        args.training_flights,
        args.train_seed,
        test_set=test_set,
        set_active=False,
    )

    artifact_path = output_dir() / MODEL_FILENAME
    joblib.dump(result.model, artifact_path)

    loaded = joblib.load(artifact_path)
    sample_mu = predict_mean(0, 100, 0, model=loaded)
    if not np.isfinite(sample_mu):
        raise RuntimeError("Reloaded model produced a non-finite prediction")

    test_observations = TEST_N_FLIGHTS * N_PERIODS
    with mlflow.start_run():
        mlflow.log_param("algorithm", ALGORITHM)
        mlflow.log_param("features", ",".join(FEATURE_NAMES))
        mlflow.log_param("target", "realized_bookings")
        mlflow.log_param("train_seed", args.train_seed)
        mlflow.log_param("test_seed", args.test_seed)
        mlflow.log_param("training_flights", result.n_flights)
        mlflow.log_param("training_observations", result.n_observations)
        mlflow.log_param("test_flights", TEST_N_FLIGHTS)
        mlflow.log_param("test_observations", test_observations)
        mlflow.log_metric("mae", result.mae)
        mlflow.log_metric("rmse", result.rmse)
        mlflow.log_metric("training_time_seconds", result.training_time_seconds)
        mlflow.log_metric("training_flights", result.n_flights)
        mlflow.log_metric("training_observations", result.n_observations)
        mlflow.log_metric("test_flights", TEST_N_FLIGHTS)
        mlflow.log_metric("test_observations", test_observations)
        mlflow.log_artifact(str(artifact_path))

    print(ALGORITHM)
    print(f"features={FEATURE_NAMES}")
    print(f"training_flights={result.n_flights}")
    print(f"training_observations={result.n_observations}")
    print(f"train_seed={args.train_seed}")
    print(f"test_flights={TEST_N_FLIGHTS}")
    print(f"test_observations={test_observations}")
    print(f"test_seed={args.test_seed}")
    print(f"mae={result.mae}")
    print(f"rmse={result.rmse}")
    print(f"training_time_seconds={result.training_time_seconds}")
    print(f"artifact={artifact_path.resolve()}")
    print(f"reload_prediction_period0_fare100_cum0={sample_mu}")


if __name__ == "__main__":
    main()
