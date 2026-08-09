import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from app.store import db
from app.models.job import IngestJob, IngestParams, IngestRequest, JobStatus


def _now(): return datetime.now(timezone.utc).isoformat()


def create_job(session, req: IngestRequest) -> IngestJob:
    from app.config import settings
    job = IngestJob(
        job_id=str(uuid.uuid4()), seed=req.seed, relationship=req.relationship,
        params=IngestParams(sample_pct=req.sample_pct, max_followers=req.max_followers,
                            posts_per_user=req.posts_per_user, enrich_all=req.enrich_all),
        budget_cap_usd=settings.x_api_spend_soft_limit_usd, created_at=_now(), updated_at=_now(),
    )
    save(session, job)
    return job


def save(session, job: IngestJob) -> None:
    job.updated_at = _now()
    session.merge(db.JobRow(job_id=job.job_id, doc=job.model_dump(mode="json"), status=job.status.value))


def get_job(session, job_id: str) -> IngestJob | None:
    row = session.get(db.JobRow, job_id)
    return IngestJob(**row.doc) if row else None


def seed_for_handle(session, handle: str) -> str | None:
    """Latest seed_account_id ingested for an X handle (@- and case-insensitive).
    Lets the API address audiences by handle without an X resolve call."""
    h = handle.lstrip("@").lower()
    best: tuple[str, str] | None = None
    for r in session.execute(select(db.JobRow)).scalars().all():
        seed = (r.doc.get("seed") or "").lstrip("@").lower()
        sid = r.doc.get("seed_account_id")
        if seed == h and sid:
            created = r.doc.get("created_at") or ""
            if best is None or created > best[0]:
                best = (created, sid)
    return best[1] if best else None


def find_done(session, seed_account_id: str, relationship: str) -> IngestJob | None:
    rows = session.execute(select(db.JobRow).where(db.JobRow.status == "done")).scalars().all()
    for r in rows:
        j = IngestJob(**r.doc)
        if j.seed_account_id == seed_account_id and j.relationship == relationship:
            return j
    return None


STALE_CLAIM_MINUTES = 20  # a claimed/running job silent this long is presumed dead


def claim_next(session) -> IngestJob | None:
    """Atomically claim the oldest QUEUED job. The row flips to 'claimed' (both
    the column AND doc.status, keeping the API's view consistent) in the same
    statement, skipping rows other workers have locked — two workers, including
    two developers' laptops sharing Neon, can never run the same job.

    Crash recovery: jobs stuck in 'claimed'/'running' whose doc.updated_at is
    older than STALE_CLAIM_MINUTES are requeued first — a crashed worker's job
    resumes on the next healthy worker instead of hanging forever. (ISO-8601
    UTC strings compare correctly lexicographically.)"""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import text as _text

    cutoff = (datetime.now(timezone.utc)
              - timedelta(minutes=STALE_CLAIM_MINUTES)).isoformat()
    session.execute(_text(
        "UPDATE jobs SET status='queued',"
        " doc = jsonb_set(doc, '{status}', '\"queued\"')"
        " WHERE status IN ('claimed','running')"
        " AND COALESCE(doc->>'updated_at', '') < :cutoff"
    ), {"cutoff": cutoff})
    row = session.execute(_text(
        "UPDATE jobs SET status='claimed',"
        " doc = jsonb_set(doc, '{status}', '\"claimed\"')"
        " WHERE job_id = ("
        "  SELECT job_id FROM jobs WHERE status='queued'"
        "  ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED"
        ") RETURNING doc"
    )).scalar()
    session.commit()
    return IngestJob(**row) if row else None
