import asyncio
import contextlib
import os

from fastapi import FastAPI, HTTPException

from app.config import settings
from app.store import db, jobs, personas, budget, clusters_stub
from app.models.job import IngestRequest

app = FastAPI(title="AgentSim Ingestion")


@app.on_event("startup")
def _startup():
    db.init_db()
    # Never start the live worker loop under pytest — it would make real X calls.
    if not os.environ.get("PYTEST_CURRENT_TEST"):
        app.state.worker = asyncio.create_task(worker_loop())


@app.on_event("shutdown")
async def _shutdown():
    worker = getattr(app.state, "worker", None)
    if worker is not None:
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker


async def worker_loop():
    from app import worker as w
    from app.ingest.x_client import XClient
    from app.ingest.tweepy_adapter import make_api, make_grok

    while True:
        await asyncio.sleep(1.0)
        try:
            with db.SessionLocal() as s:
                job = jobs.claim_next(s)
            if not job:
                continue

            def _run():
                with db.SessionLocal() as s2:
                    job2 = jobs.get_job(s2, job.job_id)
                    if job2 is None:
                        return
                    w.run_job(s2, job2, XClient(api=make_api()), grok_client=make_grok())

            await asyncio.get_running_loop().run_in_executor(None, _run)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive across job failures
            continue


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ingest")
def ingest(req: IngestRequest):
    with db.SessionLocal() as s:
        job = jobs.create_job(s, req)
        s.commit()
        return {"job_id": job.job_id, "status": job.status.value}


@app.get("/ingest/{job_id}")
def ingest_status(job_id: str):
    with db.SessionLocal() as s:
        job = jobs.get_job(s, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        return job.model_dump(mode="json")


@app.get("/ingest")
def ingest_list():
    with db.SessionLocal() as s:
        rows = (
            s.query(db.JobRow)
            .order_by(db.JobRow.created_at.desc())
            .limit(50)
            .all()
        )
        return [r.doc for r in rows]


@app.get("/personas")
def list_personas(seed_account_id: str, limit: int = 100, offset: int = 0):
    with db.SessionLocal() as s:
        return [
            d.model_dump(mode="json")
            for d in personas.list_personas(s, seed_account_id, limit, offset)
        ]


@app.get("/clusters")
def clusters():
    return clusters_stub.load_clusters()


@app.get("/budget")
def budget_status():
    with db.SessionLocal() as s:
        sp = budget.spent(s)
        return {
            "spent_usd": sp,
            "budget_usd": settings.x_api_budget_usd,
            "remaining_usd": max(0.0, settings.x_api_budget_usd - sp),
        }
