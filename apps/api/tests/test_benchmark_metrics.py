"""Benchmark metrics unit tests — Python mirror of
apps/web/lib/server/engine/benchmark.test.ts.
"""

from __future__ import annotations

from app.services.benchmark import (
    failure_mode_hit_rate,
    outcome_rank,
    spearman,
    within_category_inversions,
)


def test_spearman_is_1_for_perfectly_concordant_ranks():
    assert round(spearman([1, 2, 3, 4], [0.1, 0.2, 0.3, 0.9]), 6) == 1.0


def test_spearman_is_minus_1_for_perfectly_discordant_ranks():
    assert round(spearman([1, 2, 3, 4], [0.9, 0.3, 0.2, 0.1]), 6) == -1.0


def test_outcome_rank_maps_hit_moderate_flop():
    assert outcome_rank("hit") == 2
    assert outcome_rank("moderate") == 1
    assert outcome_rank("flop") == 0


def test_failure_mode_hit_rate_counts_a_hit_when_any_known_mode_is_in_top_blockers():
    rate = failure_mode_hit_rate([
        {"known": ["pricing_acceptance"], "topBlockers": ["pricing_acceptance", "trust"]},
        {"known": ["differentiation"], "topBlockers": ["trust", "workflow_fit"]},
    ])
    assert round(rate, 6) == 0.5


def test_within_category_inversions_counts_flop_over_hit_only_within_a_category():
    rows = [
        {"category": "b2b_saas", "score": 0.3, "rank": 2},       # a hit scored low
        {"category": "b2b_saas", "score": 0.6, "rank": 0},       # a flop scored high -> 1 inversion
        {"category": "consumer_app", "score": 0.5, "rank": 2},
    ]
    assert within_category_inversions(rows) == 1


def test_spearman_averages_tied_ranks():
    # b has a tie at the top two positions; correlation should be well-defined and < 1.
    r = spearman([1, 2, 3, 4], [0.1, 0.5, 0.5, 0.9])
    assert round(r, 5) == round(0.9486833, 5)  # rankdata([.1,.5,.5,.9]) = [1,2.5,2.5,4]


def test_spearman_returns_0_for_length_mismatch_and_n_lt_2():
    assert spearman([1, 2, 3], [1, 2]) == 0
    assert spearman([1], [1]) == 0


def test_spearman_returns_0_when_one_side_is_all_ties():
    assert spearman([1, 2, 3], [5, 5, 5]) == 0


def test_within_category_inversions_and_failure_mode_hit_rate_handle_empty_input():
    assert within_category_inversions([]) == 0
    assert failure_mode_hit_rate([]) == 1  # vacuous truth
