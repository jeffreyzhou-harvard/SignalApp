import pytest
from sqlalchemy import select
from app.store import db


@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    yield


def test_persona_row_roundtrip_with_null_vector():
    with db.SessionLocal() as s:
        s.merge(db.PersonaRow(
            user_id="u1", seed_account_id="seed", relationship="follower",
            enrichment_tier=1, doc={"handle": "@a"}, vector=None,
        ))
        s.commit()
        row = s.execute(select(db.PersonaRow).where(db.PersonaRow.user_id == "u1")).scalar_one()
        assert row.doc["handle"] == "@a"
        assert row.vector is None
