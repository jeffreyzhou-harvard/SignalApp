import pytest
from app.store import db
from app.retrieval import search as search_core
from app.retrieval.embedder import FakeEmbedder
from app.models.persona import PersonaDocument, PersonaCard


@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.commit()
    yield
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.commit()


def _insert(s, uid, handle, interests, vec, seed="seed"):
    d = PersonaDocument(
        seed_account_id=seed, relationship="follower", enrichment_tier=2,
        user_id=uid, handle=handle, display_name=handle.lstrip("@").title(),
        profile_url=f"https://x.com/{handle.lstrip('@')}", profile_image_url="http://img",
        account_age_days=1, verified=False, bio=f"I love {interests[0]}",
        metrics={"followers_count": 1, "following_count": 1, "tweet_count": 1, "listed_count": 0},
        persona_card=PersonaCard(archetype="a", one_liner=f"Into {interests[0]}",
            ranked_interests=interests, preferred_formats=["threads"], tone_affinity="neutral",
            conversion_levers=["value"], summary="s"),
    )
    s.merge(db.PersonaRow(user_id=uid, seed_account_id=seed, relationship="follower",
        enrichment_tier=2, doc=d.model_dump(), vector=vec))


def test_not_ready_when_no_vectors():
    with db.SessionLocal() as s:
        _insert(s, "u1", "@a", ["ai"], None); s.commit()
        out = search_core.search(s, FakeEmbedder([1.0, 0.0, 0.0]), "ai", k=5)
    assert out["status"] == "embeddings_not_ready"
    assert out["results"] == []


def test_not_ready_when_embedder_none():
    with db.SessionLocal() as s:
        _insert(s, "u1", "@a", ["ai"], [1.0, 0.0, 0.0]); s.commit()
        out = search_core.search(s, None, "ai", k=5)
    assert out["status"] == "embeddings_not_ready"


def test_ranks_by_cosine_similarity():
    with db.SessionLocal() as s:
        _insert(s, "u1", "@ai", ["ai"], [1.0, 0.0, 0.0])
        _insert(s, "u2", "@design", ["design"], [0.0, 1.0, 0.0])
        _insert(s, "u3", "@robotics", ["robotics"], [0.9, 0.1, 0.0])
        s.commit()
        out = search_core.search(s, FakeEmbedder([1.0, 0.0, 0.0]), "ai", k=2)
    assert out["status"] == "ok"
    assert [r["user_id"] for r in out["results"]] == ["u1", "u3"]
    assert out["results"][0]["score"] >= out["results"][1]["score"]
    assert out["results"][0]["ranked_interests"] == ["ai"]


def test_seed_account_filter():
    with db.SessionLocal() as s:
        _insert(s, "u1", "@a", ["ai"], [1.0, 0.0, 0.0], seed="seedA")
        _insert(s, "u2", "@b", ["ai"], [1.0, 0.0, 0.0], seed="seedB")
        s.commit()
        out = search_core.search(s, FakeEmbedder([1.0, 0.0, 0.0]), "ai", k=5,
                                 seed_account_id="seedB")
    assert [r["user_id"] for r in out["results"]] == ["u2"]
