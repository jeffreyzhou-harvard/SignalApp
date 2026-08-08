import pytest
from app.store import db, personas
from app.models.persona import PersonaDocument


@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.commit()
    yield
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.commit()


def _doc(uid="900001", handle="@Ada"):
    return PersonaDocument(
        seed_account_id="seed", relationship="follower", enrichment_tier=1,
        user_id=uid, handle=handle, display_name="Ada", profile_url="https://x.com/ada",
        profile_image_url="http://img", account_age_days=1, verified=False, bio="hi",
        metrics={"followers_count": 1, "following_count": 1, "tweet_count": 1, "listed_count": 0},
    )


def test_find_by_user_id():
    with db.SessionLocal() as s:
        personas.upsert_persona(s, _doc()); s.commit()
        assert personas.find_persona(s, "900001").handle == "@Ada"


def test_find_by_handle_case_and_at_insensitive():
    with db.SessionLocal() as s:
        personas.upsert_persona(s, _doc()); s.commit()
        assert personas.find_persona(s, "ada").user_id == "900001"
        assert personas.find_persona(s, "@ada").user_id == "900001"
        assert personas.find_persona(s, "ADA").user_id == "900001"


def test_find_miss_returns_none():
    with db.SessionLocal() as s:
        assert personas.find_persona(s, "nobody") is None
