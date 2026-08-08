import pytest
from app.store import db, personas
from app.models.persona import PersonaDocument

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.query(db.RawUserRow).delete(); s.commit()
    yield

def _tier1(uid="u1"):
    return PersonaDocument(
        seed_account_id="seed", relationship="follower", enrichment_tier=1,
        user_id=uid, handle="@a", display_name="A", profile_url="https://x.com/a",
        profile_image_url="http://img", account_age_days=1, verified=False, bio="hi",
        metrics={"followers_count": 1, "following_count": 1, "tweet_count": 1, "listed_count": 0},
    )

def test_cache_user_roundtrip():
    with db.SessionLocal() as s:
        assert personas.get_cached_user(s, "u1") is None
        personas.cache_user(s, "u1", {"username": "a"}); s.commit()
        assert personas.get_cached_user(s, "u1")["username"] == "a"

def test_upsert_and_get_persona_keeps_vector_null():
    with db.SessionLocal() as s:
        personas.upsert_persona(s, _tier1()); s.commit()
        got = personas.get_persona(s, "u1")
        assert got.enrichment_tier == 1 and got.embedding is None
        row = s.get(db.PersonaRow, "u1")
        assert row.vector is None
