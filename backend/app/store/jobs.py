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
                            posts_per_user=req.posts_per_user),
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


def find_done(session, seed_account_id: str, relationship: str) -> IngestJob | None:
    rows = session.execute(select(db.JobRow).where(db.JobRow.status == "done")).scalars().all()
    for r in rows:
        j = IngestJob(**r.doc)
        if j.seed_account_id == seed_account_id and j.relationship == relationship:
            return j
    return None


def claim_next(session) -> IngestJob | None:
    """Atomically claim the oldest QUEUED job. The row flips to 'claimed' in the
    same statement (skipping rows other workers have locked), so two workers —
    including two developers' laptops sharing Neon — can never run the same job.
    Jobs stuck in 'running'/'claimed' are NOT re-claimed automatically; requeue
    deliberately by setting status='queued'."""
    from sqlalchemy import text as _text

    row = session.execute(_text(
        "UPDATE jobs SET status='claimed' WHERE job_id = ("
        "  SELECT job_id FROM jobs WHERE status='queued'"
        "  ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED"
        ") RETURNING doc"
    )).scalar()
    session.commit()
    return IngestJob(**row) if row else None
