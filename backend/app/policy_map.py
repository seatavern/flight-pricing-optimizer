from __future__ import annotations

from app.market import CAPACITY, FARES, N_PERIODS
from app.myopic_evaluation import get_myopic_policy_value
from app.optimized import get_bellman_solution


def _public_fare(fare: int) -> int | None:
    value = int(fare)
    if value not in FARES.tolist():
        return None
    return value


def policy_map_payload() -> dict[str, object]:
    myopic_eval = get_myopic_policy_value()
    bellman = get_bellman_solution()
    states: list[dict[str, int | None]] = []
    for period in range(N_PERIODS):
        for remaining in range(CAPACITY + 1):
            myopic_fare = _public_fare(int(myopic_eval.policy[period, remaining]))
            optimized_fare = _public_fare(int(bellman.policy[period, remaining]))
            fare_difference = (
                None
                if myopic_fare is None or optimized_fare is None
                else optimized_fare - myopic_fare
            )
            states.append(
                {
                    "period": period,
                    "remaining_capacity": remaining,
                    "myopic_fare": myopic_fare,
                    "optimized_fare": optimized_fare,
                    "fare_difference": fare_difference,
                }
            )
    return {"states": states}
