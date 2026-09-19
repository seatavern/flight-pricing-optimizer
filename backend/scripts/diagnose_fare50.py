from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.demand_model import TRAIN_SEED, get_active_model, get_fixed_test_set, train_demand_model
from app.market import CAPACITY, FARES, N_PERIODS
from app.myopic import myopic_decision
from app.optimized import get_bellman_solution, optimized_decision

UI_PERIODS = [f"T-{10 - t}" for t in range(N_PERIODS)]
PREFERRED_PERIODS = range(2, 7)  # T-8 through T-4
PREFERRED_REMAINING = range(20, 81)


def candidate_rows(period: int, remaining: int) -> list[dict[str, float | int]]:
    decision = optimized_decision(period, CAPACITY - remaining)
    return [
        {
            "fare": row.fare,
            "predicted_mu": row.predicted_mu,
            "expected_sales": row.expected_sales,
            "immediate_expected_revenue": row.immediate_expected_revenue,
            "future_value": row.future_value,
            "total_value": row.total_value,
        }
        for row in decision.candidates
    ]


def main() -> None:
    fares = [int(fare) for fare in FARES.tolist()]
    assert fares == [50, 60, 70, 80, 90, 100, 110, 120, 130], fares

    print("Training 10,000-flight model (TRAIN_SEED=1)...", flush=True)
    result = train_demand_model(10_000, TRAIN_SEED, test_set=get_fixed_test_set(), set_active=True)
    print("Recomputing Bellman...", flush=True)
    solution = get_bellman_solution()
    model = get_active_model()
    assert model is not None
    assert solution.model_id == id(model)

    myopic_policy = np.empty((N_PERIODS, CAPACITY + 1), dtype=np.int64)
    for period in range(N_PERIODS):
        for remaining in range(CAPACITY + 1):
            myopic_policy[period, remaining] = myopic_decision(period, CAPACITY - remaining).selected_fare

    opening_myopic = myopic_decision(0, 0)
    opening_optimized = optimized_decision(0, 0)
    opening_rows = candidate_rows(0, 100)

    period9_agree = all(
        int(myopic_policy[9, remaining]) == int(solution.policy[9, remaining])
        for remaining in range(CAPACITY + 1)
    )
    period9_future_zero = bool(np.allclose(solution.future_value[9], 0.0))

    disagreements = []
    for period in PREFERRED_PERIODS:
        for remaining in PREFERRED_REMAINING:
            myo_fare = int(myopic_policy[period, remaining])
            opt_fare = int(solution.policy[period, remaining])
            if myo_fare == opt_fare:
                continue
            myo_idx = fares.index(myo_fare)
            opt_idx = fares.index(opt_fare)
            d_imm = float(
                solution.immediate_expected_revenue[period, remaining, opt_idx]
                - solution.immediate_expected_revenue[period, remaining, myo_idx]
            )
            d_fut = float(
                solution.future_value[period, remaining, opt_idx]
                - solution.future_value[period, remaining, myo_idx]
            )
            d_tot = float(
                solution.action_value[period, remaining, opt_idx]
                - solution.action_value[period, remaining, myo_idx]
            )
            fare_gap = abs(opt_fare - myo_fare)
            if abs(d_tot) < 1.0:
                continue
            disagreements.append(
                {
                    "period": period,
                    "ui_period": UI_PERIODS[period],
                    "remaining": remaining,
                    "cumulative_bookings": CAPACITY - remaining,
                    "myopic_fare": myo_fare,
                    "optimized_fare": opt_fare,
                    "fare_gap": fare_gap,
                    "d_immediate": d_imm,
                    "d_future": d_fut,
                    "d_total": d_tot,
                    "score": fare_gap * 20.0 + abs(d_tot),
                }
            )

    disagreements.sort(key=lambda row: row["score"], reverse=True)
    chosen = disagreements[0] if disagreements else None
    chosen_rows = None
    if chosen is not None:
        chosen_rows = candidate_rows(int(chosen["period"]), int(chosen["remaining"]))

    out = {
        "fares": fares,
        "n_fares": len(fares),
        "training": {
            "n_flights": result.n_flights,
            "n_observations": result.n_observations,
            "mae": result.mae,
            "rmse": result.rmse,
            "training_time_seconds": result.training_time_seconds,
        },
        "bellman_seconds": solution.computation_time_seconds,
        "opening": {
            "period": 0,
            "remaining": 100,
            "cumulative_bookings": 0,
            "myopic_fare": opening_myopic.selected_fare,
            "optimized_fare": opening_optimized.selected_fare,
            "rows": opening_rows,
        },
        "chosen_state": chosen,
        "chosen_rows": chosen_rows,
        "n_preferred_disagreements": len(disagreements),
        "sanity": {
            "nine_fares": len(fares) == 9 and fares[0] == 50,
            "fifty_in_myopic": 50 in [row.fare for row in opening_myopic.candidates],
            "fifty_in_optimized": 50 in [row.fare for row in opening_optimized.candidates],
            "same_model": solution.model_id == id(model),
            "period9_future_zero": period9_future_zero,
            "period9_policies_agree": period9_agree,
        },
    }
    out_path = Path(r"C:\Users\joelm\AppData\Local\Temp\fare50_diagnostic.json")
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))
    print(f"\nWrote {out_path}", flush=True)


if __name__ == "__main__":
    main()
