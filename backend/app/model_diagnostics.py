from __future__ import annotations

import numpy as np

from app.demand_model import get_active_model, predict_mean_batch
from app.market import CAPACITY, FARES, N_PERIODS
from app.myopic import DemandModelNotTrainedError

DIAGNOSTIC_KINDS = ("fare", "bookings", "surface")


def _require_model():
    fitted = get_active_model()
    if fitted is None:
        raise DemandModelNotTrainedError("Demand model is not trained")
    return fitted


def fare_diagnostic(period: int, cumulative_bookings: int) -> dict[str, object]:
    _require_model()
    fares = FARES.astype(np.float64)
    n = int(fares.shape[0])
    periods = np.full(n, float(period))
    bookings = np.full(n, float(cumulative_bookings))
    predicted = predict_mean_batch(periods, fares, bookings)
    return {
        "kind": "fare",
        "period": int(period),
        "cumulative_bookings": int(cumulative_bookings),
        "points": [
            {"fare": int(fare), "predicted_mu": float(mu)}
            for fare, mu in zip(FARES.tolist(), predicted.tolist(), strict=True)
        ],
    }


def bookings_diagnostic(period: int, fare: int) -> dict[str, object]:
    _require_model()
    bookings = np.arange(CAPACITY + 1, dtype=np.float64)
    n = int(bookings.shape[0])
    periods = np.full(n, float(period))
    fares = np.full(n, float(fare))
    predicted = predict_mean_batch(periods, fares, bookings)
    return {
        "kind": "bookings",
        "period": int(period),
        "fare": int(fare),
        "points": [
            {"cumulative_bookings": int(sold), "predicted_mu": float(mu)}
            for sold, mu in zip(range(CAPACITY + 1), predicted.tolist(), strict=True)
        ],
    }


def surface_diagnostic(period: int) -> dict[str, object]:
    _require_model()
    n_fares = int(FARES.shape[0])
    n_bookings = CAPACITY + 1
    periods = np.repeat(np.array([float(period)]), n_fares * n_bookings)
    fares = np.tile(FARES.astype(np.float64), n_bookings)
    bookings = np.repeat(np.arange(n_bookings, dtype=np.float64), n_fares)
    predicted = predict_mean_batch(periods, fares, bookings).reshape(n_bookings, n_fares)
    cells: list[dict[str, float | int]] = []
    for sold in range(n_bookings):
        for fare_index, fare in enumerate(FARES.tolist()):
            cells.append(
                {
                    "fare": int(fare),
                    "cumulative_bookings": sold,
                    "predicted_mu": float(predicted[sold, fare_index]),
                }
            )
    return {
        "kind": "surface",
        "period": int(period),
        "cells": cells,
    }


def diagnostic_payload(
    kind: str,
    period: int,
    fare: int | None = None,
    cumulative_bookings: int | None = None,
) -> dict[str, object]:
    if period < 0 or period >= N_PERIODS:
        raise ValueError(f"period must be in 0..{N_PERIODS - 1}")
    if kind == "fare":
        if cumulative_bookings is None:
            raise ValueError("cumulative_bookings is required for fare diagnostics")
        sold = max(0, min(int(CAPACITY), int(cumulative_bookings)))
        return fare_diagnostic(int(period), sold)
    if kind == "bookings":
        if fare is None:
            raise ValueError("fare is required for bookings diagnostics")
        if int(fare) not in FARES.tolist():
            raise ValueError("fare must be on the nine-fare grid")
        return bookings_diagnostic(int(period), int(fare))
    if kind == "surface":
        return surface_diagnostic(int(period))
    raise ValueError("unknown diagnostic kind")
