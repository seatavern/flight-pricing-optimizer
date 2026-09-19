from __future__ import annotations

from app.market import CAPACITY, N_PERIODS
from app.myopic_evaluation import get_myopic_policy_value
from app.optimized import get_bellman_solution


def policy_map_payload() -> dict[str, object]:
    myopic_eval = get_myopic_policy_value()
    bellman = get_bellman_solution()
    states: list[dict[str, int]] = []
    for period in range(N_PERIODS):
        for remaining in range(CAPACITY + 1):
            myopic_fare = int(myopic_eval.policy[period, remaining])
            optimized_fare = int(bellman.policy[period, remaining])
            states.append(
                {
                    "period": period,
                    "remaining_capacity": remaining,
                    "myopic_fare": myopic_fare,
                    "optimized_fare": optimized_fare,
                    "fare_difference": optimized_fare - myopic_fare,
                }
            )
    return {"states": states}
