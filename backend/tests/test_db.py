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


def test_claim_next_is_atomic_and_queued_only():
    """Two workers (or two laptops on shared Neon) must never claim the same
    job; done/running/claimed jobs are never re-claimed (the $30 runaway bug)."""
    import uuid
    from sqlalchemy import text
    from app.store import jobs as jobs_store
    from app.store.db import SessionLocal
    from app.models.job import IngestJob, IngestParams

    s = SessionLocal()
    jid = str(uuid.uuid4())
    job = IngestJob(job_id=jid, seed="@atomic_test",
                    params=IngestParams(sample_pct=0.2, max_followers=10, posts_per_user=5),
                    created_at="2026-08-09T00:00:00Z", updated_at="2026-08-09T00:00:00Z")
    jobs_store.save(s, job); s.commit()

    first = jobs_store.claim_next(s)
    s2 = SessionLocal()
    second = jobs_store.claim_next(s2)
    assert first is not None and first.job_id == jid
    assert second is None or second.job_id != jid  # never double-claimed
    for status in ("running", "done", "failed", "claimed"):
        s.execute(text("UPDATE jobs SET status=:st WHERE job_id=:j"), {"st": status, "j": jid})
        s.commit()
        again = jobs_store.claim_next(s)
        assert again is None or again.job_id != jid
    s.execute(text("DELETE FROM jobs WHERE job_id=:j"), {"j": jid}); s.commit()
    s.close(); s2.close()
