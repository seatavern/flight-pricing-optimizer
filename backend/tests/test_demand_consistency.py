import numpy as np
from scipy.stats import poisson

from app.data_generation import TARGET_NAME, generate_training_data
from app.demand_model import FEATURE_NAMES, predict_mean, predict_mean_batch, train_demand_model
from app.market import CAPACITY, FARES, NO_FARE, sample_realized_bookings, true_market_mean
from app.myopic import myopic_decision
from app.optimized import get_bellman_solution, optimized_decision
from app.poisson_expectation import capped_poisson_probabilities, expected_min_poisson
from app.policy_evaluation import poisson_from_uniform


def test_latent_poisson_sampler_is_not_capped_at_40() -> None:
    assert poisson_from_uniform(60.0, 0.99) == 79
    assert poisson_from_uniform(77.0, 0.999) == 105
    assert poisson_from_uniform(60.0, 0.5) > 40


def test_realized_bookings_never_exceed_remaining_capacity() -> None:
    rng = np.random.default_rng(4)
    for remaining in (0, 1, 7, 40):
        for _ in range(30):
            latent, realized = sample_realized_bookings(rng, 80.0, remaining)
            assert 0 <= realized <= remaining
            assert latent >= realized


def test_realized_sales_pmf_sums_to_one_and_puts_the_tail_at_capacity() -> None:
    probabilities = capped_poisson_probabilities(47.5, 20)
    assert abs(float(probabilities.sum()) - 1.0) < 1e-12
    assert abs(float(probabilities[-1]) - float(poisson.sf(19, 47.5))) < 1e-10
    assert abs(float(probabilities[5]) - float(poisson.pmf(5, 47.5))) < 1e-10
    assert float(probabilities[-1]) > float(poisson.pmf(20, 47.5))


def test_zero_capacity_expected_sales_are_zero_and_full_capacity_approaches_the_mean() -> None:
    assert expected_min_poisson(47.5, 0) == 0.0
    assert capped_poisson_probabilities(47.5, 0).tolist() == [1.0]
    assert abs(expected_min_poisson(8.0, 80) - 8.0) < 1e-6


def test_training_target_is_latent_demand_with_observable_features_only() -> None:
    data = generate_training_data(25, seed=3)
    assert TARGET_NAME == "latent_demand"
    assert data.feature_names() == FEATURE_NAMES == ("period", "fare", "cumulative_bookings")
    assert np.array_equal(data.target(), data.diagnostics["latent_demand"])
    assert np.all(data.realized_bookings <= data.cumulative_bookings + (CAPACITY - data.cumulative_bookings))
    assert np.all(data.realized_bookings <= CAPACITY - data.cumulative_bookings)
    assert "strength" not in data.feature_names()


def test_myopic_expected_revenue_censors_the_latent_prediction_once() -> None:
    train_demand_model(40, 1)
    decision = myopic_decision(4, 90)
    assert decision.selected_fare in FARES.tolist()
    for candidate in decision.candidates:
        sales = expected_min_poisson(candidate.predicted_mu, 10)
        assert abs(candidate.expected_sales - sales) < 1e-9
        assert abs(candidate.expected_revenue - candidate.fare * sales) < 1e-8
        assert candidate.expected_sales <= 10 + 1e-9


def test_optimized_transitions_use_the_censored_poisson_distribution() -> None:
    train_demand_model(40, 1)
    solution = get_bellman_solution()
    period = 3
    remaining = 12
    fare_index = 2
    mu = float(solution.predicted_mu[period, remaining, fare_index])
    probabilities = capped_poisson_probabilities(mu, remaining)
    quantities = np.arange(remaining + 1, dtype=np.float64)
    assert abs(float(probabilities.sum()) - 1.0) < 1e-12
    assert abs(float(probabilities[-1]) - float(poisson.sf(remaining - 1, mu))) < 1e-10
    sales = float(np.dot(probabilities, quantities))
    assert abs(float(solution.expected_sales[period, remaining, fare_index]) - sales) < 1e-9
    assert abs(sales - expected_min_poisson(mu, remaining)) < 1e-8
    assert np.all(solution.policy[:, 0] == NO_FARE)
    assert np.allclose(solution.value[:, 0], 0.0)
    assert np.allclose(solution.expected_sales[:, 0, :], 0.0)


def test_same_market_and_fare_have_the_same_latent_demand_for_every_strategy() -> None:
    strength = 0.42
    uniforms = np.full(10, 0.37)
    myopic = [
        poisson_from_uniform(true_market_mean(90, period, strength), float(uniforms[period]))
        for period in range(10)
    ]
    optimized = [
        poisson_from_uniform(true_market_mean(90, period, strength), float(uniforms[period]))
        for period in range(10)
    ]
    assert optimized == myopic
    assert true_market_mean(50, 6, strength) > true_market_mean(130, 6, strength)


def test_sold_out_flight_has_no_actionable_fare() -> None:
    train_demand_model(40, 1)
    myopic = myopic_decision(6, CAPACITY)
    optimized = optimized_decision(6, CAPACITY)
    assert myopic.selected_fare is None
    assert optimized.selected_fare is None
    assert myopic.expected_revenue == 0.0
    assert optimized.total_value == 0.0
    assert optimized.future_value == 0.0
    assert all(candidate.expected_sales == 0.0 for candidate in myopic.candidates)
    assert all(np.isfinite(candidate.predicted_mu) for candidate in myopic.candidates)


def test_training_and_inference_use_the_same_feature_order() -> None:
    train_demand_model(40, 1)
    period, fare, cumulative = 2, 110, 37
    single = predict_mean(period, fare, cumulative)
    batch = predict_mean_batch(np.array([period]), np.array([fare]), np.array([cumulative]))
    assert abs(single - float(batch[0])) < 1e-12


def test_predicted_latent_demand_does_not_increase_with_fare() -> None:
    train_demand_model(80, 1)
    for period in (0, 4, 9):
        for cumulative in (0, 40, 90):
            previous = predict_mean(period, int(FARES[0]), cumulative)
            for fare in FARES.tolist()[1:]:
                predicted = predict_mean(period, int(fare), cumulative)
                assert predicted <= previous + 1e-8
                previous = predicted
