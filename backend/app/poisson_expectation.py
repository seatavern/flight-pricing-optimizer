from __future__ import annotations

import numpy as np
from scipy.stats import poisson


def expected_min_poisson(mu: float, capacity: int) -> float:
    """E[min(D, capacity)] for D ~ Poisson(mu)."""
    if capacity <= 0:
        return 0.0
    mean = float(mu)
    if not np.isfinite(mean) or mean <= 0.0:
        return 0.0
    ks = np.arange(int(capacity), dtype=np.int64)
    expected = float(np.sum(poisson.sf(ks, mean)))
    return float(min(max(expected, 0.0), float(capacity)))


def capped_poisson_probabilities(mu: float, capacity: int) -> np.ndarray:
    """P(Q = q) for Q = min(D, c) with D ~ Poisson(mu).

    The Poisson tail P(D >= c) is aggregated into q = c.
    """
    if capacity <= 0:
        return np.array([1.0], dtype=np.float64)
    mean = float(mu)
    probs = np.zeros(int(capacity) + 1, dtype=np.float64)
    if not np.isfinite(mean) or mean <= 0.0:
        probs[0] = 1.0
        return probs
    ks = np.arange(int(capacity), dtype=np.int64)
    probs[:-1] = poisson.pmf(ks, mean)
    probs[-1] = poisson.sf(int(capacity) - 1, mean)
    return probs
