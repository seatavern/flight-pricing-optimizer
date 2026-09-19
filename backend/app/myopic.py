from __future__ import annotations

from dataclasses import dataclass

from app.demand_model import get_active_model, predict_mean
from app.market import CAPACITY, FARES, N_PERIODS
from app.poisson_expectation import expected_min_poisson


class DemandModelNotTrainedError(RuntimeError):
    pass


@dataclass(frozen=True)
class FareCandidate:
    fare: int
    predicted_mu: float
    expected_sales: float
    expected_revenue: float


@dataclass(frozen=True)
class MyopicDecision:
    selected_fare: int
    predicted_mu: float
    expected_sales: float
    expected_revenue: float
    candidates: tuple[FareCandidate, ...]


def myopic_decision(period: int, cumulative_bookings: int) -> MyopicDecision:
    if get_active_model() is None:
        raise DemandModelNotTrainedError("Demand model is not trained")
    if period < 0 or period >= N_PERIODS:
        raise ValueError(f"period must be in 0..{N_PERIODS - 1}")
    if cumulative_bookings < 0:
        raise ValueError("cumulative_bookings must be >= 0")

    remaining_capacity = max(0, CAPACITY - int(cumulative_bookings))
    candidates: list[FareCandidate] = []
    for fare in FARES.tolist():
        predicted_mu = predict_mean(period, float(fare), float(cumulative_bookings))
        expected_sales = expected_min_poisson(predicted_mu, remaining_capacity)
        expected_revenue = float(fare) * expected_sales
        candidates.append(
            FareCandidate(
                fare=int(fare),
                predicted_mu=predicted_mu,
                expected_sales=expected_sales,
                expected_revenue=expected_revenue,
            )
        )

    selected = max(candidates, key=lambda row: row.expected_revenue)
    return MyopicDecision(
        selected_fare=selected.fare,
        predicted_mu=selected.predicted_mu,
        expected_sales=selected.expected_sales,
        expected_revenue=selected.expected_revenue,
        candidates=tuple(candidates),
    )


def myopic_payload(decision: MyopicDecision) -> dict[str, object]:
    return {
        "selected_fare": decision.selected_fare,
        "predicted_mu": decision.predicted_mu,
        "expected_sales": decision.expected_sales,
        "expected_revenue": decision.expected_revenue,
        "candidates": [
            {
                "fare": row.fare,
                "predicted_mu": row.predicted_mu,
                "expected_sales": row.expected_sales,
                "expected_revenue": row.expected_revenue,
            }
            for row in decision.candidates
        ],
    }
