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
    row = session.execute(
        select(db.JobRow).where(db.JobRow.status.in_(["queued", "running"]))
        .order_by(db.JobRow.created_at).limit(1)
    ).scalars().first()
    return IngestJob(**row.doc) if row else None
