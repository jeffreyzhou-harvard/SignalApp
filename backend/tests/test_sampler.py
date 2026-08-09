from app.ingest import sampler
from app.models.persona import PersonaDocument, SeedEngagement


def _doc(uid, followers, engaged=False, bio="hi"):
    return PersonaDocument(
        seed_account_id="s",
        enrichment_tier=1,
        user_id=uid,
        handle="@" + uid,
        display_name=uid,
        profile_url="https://x.com/" + uid,
        profile_image_url="i",
        account_age_days=1,
        verified=False,
        bio=bio,
        metrics={"followers_count": followers, "following_count": 1, "tweet_count": 1, "listed_count": 0},
        seed_engagement=SeedEngagement(likes_on_seed_posts=1) if engaged else None,
    )


def test_engaged_followers_ranked_first():
    docs = [_doc("a", 10000), _doc("b", 5, engaged=True), _doc("c", 50)]
    picked = sampler.select_tier2(docs, sample_pct=0.34, min_n=1)
    assert picked[0] == "b"  # engaged wins despite low followers


def test_min_n_floor_and_skips_empty_bio():
    docs = [_doc(str(i), i) for i in range(200)] + [_doc("empty", 999, bio="")]
    picked = sampler.select_tier2(docs, sample_pct=0.2, min_n=100)
    assert len(picked) >= 100
    assert "empty" not in picked


def test_random_stratum_included():
    # 100 high-signal + 100 low-signal eligible users; target 50 →
    # 35 ranked + 15 random. Random stratum must reach outside the top-35.
    docs = [_doc(f"top{i}", 100000 - i, engaged=True) for i in range(100)]
    docs += [_doc(f"tail{i}", 10) for i in range(100)]
    picked = sampler.select_tier2(docs, sample_pct=0.25, min_n=1)
    assert len(picked) == 50
    tail_picked = [u for u in picked if u.startswith("tail")]
    assert len(tail_picked) > 0, "random stratum never reached the tail"
    # determinism: same seed, same sample
    assert picked == sampler.select_tier2(docs, sample_pct=0.25, min_n=1)
