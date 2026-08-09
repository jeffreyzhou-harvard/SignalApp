from app.models.persona import PersonaDocument, PersonaCard


def test_tier1_persona_allows_null_content_and_embedding():
    doc = PersonaDocument(
        schema_version="1.0", seed_account_id="44196397", relationship="follower",
        enrichment_tier=1, user_id="1", handle="@a", display_name="A",
        profile_url="https://x.com/a", profile_image_url="http://img", account_age_days=100,
        verified=False, verified_type=None, location=None, url=None, bio="hi",
        metrics={"followers_count": 1, "following_count": 2, "tweet_count": 3, "listed_count": 0},
        seed_engagement=None, content=None, persona_card=None, embedding=None,
    )
    assert doc.enrichment_tier == 1
    assert doc.content is None and doc.embedding is None


def test_sample_post_carries_entities_and_referenced_user():
    from app.models.persona import SamplePost
    p = SamplePost(text="x", type="quote", created_at="2026-08-05T00:00:00Z",
                   mentions=[{"id": "9", "handle": "@k"}], hashtags=["#e"],
                   referenced_user={"id": "9", "handle": "@k"},
                   metrics={"like": 1, "reply": 0, "repost": 0, "bookmark": 0})
    assert p.referenced_user.handle == "@k"
    assert p.mentions[0].id == "9"


def test_persona_parses_provenance_only_embedding():
    """ml write_vectors stamps doc.embedding without embed_input/vector — a
    persona carrying that stamp must parse (SpaceXAI ingest failure, Aug 9)."""
    from app.models.persona import PersonaDocument

    doc = PersonaDocument(
        seed_account_id="s", enrichment_tier=2, user_id="u1", handle="@u1",
        display_name="U", profile_url="https://x.com/u1", profile_image_url="i",
        account_age_days=1, verified=False, bio="hi",
        metrics={"followers_count": 1, "following_count": 1, "tweet_count": 1, "listed_count": 0},
        embedding={"model": "gemini-embedding-001", "dim": 1536,
                   "embedding_version": "v5-active"},
    )
    assert doc.embedding.vector is None and doc.embedding.dim == 1536
