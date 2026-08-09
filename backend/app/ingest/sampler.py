from app.models.persona import PersonaDocument


def _score(d: PersonaDocument) -> tuple:
    se = d.seed_engagement
    engaged = (se.likes_on_seed_posts + se.replies + se.reposts) if se else 0
    return (engaged, d.metrics.followers_count, d.metrics.tweet_count)


RANKED_FRACTION = 0.7  # 70% top-ranked, 30% random — the random stratum keeps
# the deep sample representative of the audience, not just its celebrities/top
# engagers (a pure top-ranked sample fits clusters to the influential slice,
# then assigns ordinary followers into tribes never fit on people like them).


def select_tier2(tier1_docs: list[PersonaDocument], sample_pct: float, min_n: int = 100,
                 seed: int = 42) -> list[str]:
    """
    Select tier-2 personas from tier-1 docs: engagement-first ranking for 70%
    of the target, seeded-random from the remaining eligible pool for 30%.

    Args:
        tier1_docs: List of PersonaDocument objects (tier 1)
        sample_pct: Percentage of docs to sample (0.0-1.0)
        min_n: Minimum number of docs to select (default 100)
        seed: RNG seed for the random stratum (deterministic runs)

    Returns:
        List of user_id strings for selected tier-2 personas
    """
    import random

    eligible = [d for d in tier1_docs if d.bio.strip()]
    ranked = sorted(eligible, key=_score, reverse=True)
    target = max(min_n, int(len(tier1_docs) * sample_pct))
    n_ranked = min(max(1, int(target * RANKED_FRACTION)), len(ranked))
    picked = ranked[:n_ranked]
    rest = ranked[n_ranked:]
    n_random = min(target - n_ranked, len(rest))
    if n_random > 0:
        picked += random.Random(seed).sample(rest, n_random)
    return [d.user_id for d in picked]
