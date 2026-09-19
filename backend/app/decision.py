from __future__ import annotations

from app.market import CAPACITY
from app.myopic import myopic_decision
from app.myopic_evaluation import get_myopic_policy_value
from app.optimized import optimized_decision, optimized_payload


def decision_payload(period: int, remaining_capacity: int) -> dict[str, object]:
    remaining = max(0, min(int(CAPACITY), int(remaining_capacity)))
    cumulative_bookings = int(CAPACITY) - remaining
    myopic = myopic_decision(period, cumulative_bookings)
    optimized = optimized_decision(period, cumulative_bookings)
    myopic_eval = get_myopic_policy_value()
    return {
        "period": period,
        "remaining_capacity": remaining,
        "cumulative_bookings": cumulative_bookings,
        "myopic_selected_fare": myopic.selected_fare,
        "myopic_immediate_expected_revenue": float(
            myopic_eval.immediate_expected_revenue[period, remaining]
        ),
        "myopic_continuation_value": float(myopic_eval.continuation_value[period, remaining]),
        "myopic_total_policy_value": float(myopic_eval.value[period, remaining]),
        "optimized_selected_fare": optimized.selected_fare,
        "optimized_immediate_expected_revenue": optimized.immediate_expected_revenue,
        "optimized_continuation_value": optimized.future_value,
        "optimized_total_policy_value": optimized.total_value,
        "candidates": optimized_payload(optimized)["candidates"],
    }
