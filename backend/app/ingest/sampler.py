from app.models.persona import PersonaDocument


def _score(d: PersonaDocument) -> tuple:
    se = d.seed_engagement
    engaged = (se.likes_on_seed_posts + se.replies + se.reposts) if se else 0
    return (engaged, d.metrics.followers_count, d.metrics.tweet_count)


def select_tier2(tier1_docs: list[PersonaDocument], sample_pct: float, min_n: int = 100) -> list[str]:
    """
    Select tier-2 personas from tier-1 docs using stratified, engagement-first sampling.

    Args:
        tier1_docs: List of PersonaDocument objects (tier 1)
        sample_pct: Percentage of docs to sample (0.0-1.0)
        min_n: Minimum number of docs to select (default 100)

    Returns:
        List of user_id strings for selected tier-2 personas
    """
    eligible = [d for d in tier1_docs if d.bio.strip()]
    ranked = sorted(eligible, key=_score, reverse=True)
    target = max(min_n, int(len(tier1_docs) * sample_pct))
    return [d.user_id for d in ranked[:target]]
