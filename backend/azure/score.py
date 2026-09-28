import json
import os

import joblib
import numpy as np


def init():
    global model

    model_dir = os.environ["AZUREML_MODEL_DIR"]
    model_path = os.path.join(model_dir, "demand_model.joblib")
    model = joblib.load(model_path)


def run(raw_data):
    try:
        data = json.loads(raw_data)

        period = int(data["period"])
        fare = float(data["fare"])
        cumulative_bookings = float(data["cumulative_bookings"])

        X = np.array(
            [[period, fare, cumulative_bookings]],
            dtype=float,
        )

        prediction = float(model.predict(X)[0])
        prediction = max(0.0, prediction)

        return {
            "predicted_bookings": prediction
        }

    except Exception as exc:
        return {
            "error": str(exc)
        }