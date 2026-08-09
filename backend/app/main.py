import asyncio
import contextlib
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.store import db, jobs, personas, budget
from app.store import clusters as cluster_store
from app.store import audience as audience_store
from app.models.job import IngestRequest
from app.mcp.server import mcp as mcp_server


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    worker_task = None
    # Never start the live worker loop under pytest — it would make real X calls.
    # Also skip on read-only deploys (RUN_WORKER=false) so it doesn't race a
    # local worker for jobs on the shared Neon DB.
    if settings.run_worker and not os.environ.get("PYTEST_CURRENT_TEST"):
        worker_task = asyncio.create_task(worker_loop())
    # Run the MCP streamable-HTTP session manager for the app's lifetime.
    async with mcp_server.session_manager.run():
        yield
    if worker_task is not None:
        worker_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker_task


app = FastAPI(title="AgentSim Ingestion", lifespan=lifespan)
# The Next.js frontend proxies server-side today, but browser calls (and the
# deployed split: Vercel frontend + Railway backend) need CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/mcp", mcp_server.streamable_http_app())


async def worker_loop():
    from app import worker as w
    from app.ingest.x_client import XClient
    from app.ingest.tweepy_adapter import make_api, make_grok

    while True:
        await asyncio.sleep(settings.worker_poll_interval_s)
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
def clusters(seed_account_id: str | None = None):
    """Clusters for the seed's active run; fixture fallback without one."""
    with db.SessionLocal() as s:
        return cluster_store.load_clusters(s, seed_account_id)


@app.get("/audiences")
def audiences():
    """Ingested seed accounts (handle + persona counts) for the audience picker."""
    with db.SessionLocal() as s:
        return audience_store.list_audiences(s)


@app.get("/audience")
def audience(seed_account_id: str | None = None, handle: str | None = None):
    """Combined galaxy payload: active run + clusters + members with personas.
    Resolution order: explicit seed_account_id > handle (mapped through past
    ingest jobs, no X API call) > most recently activated run."""
    with db.SessionLocal() as s:
        if seed_account_id is None and handle:
            seed_account_id = jobs.seed_for_handle(s, handle)
        return audience_store.audience_snapshot(s, seed_account_id)


@app.get("/users/{user_id}/cluster")
def user_cluster(user_id: str, seed_account_id: str):
    """Drill-down: which tribe is this user in (active run)?"""
    with db.SessionLocal() as s:
        hit = cluster_store.cluster_for_user(s, user_id, seed_account_id)
        if not hit:
            raise HTTPException(status_code=404, detail="user not in the active run")
        return hit


@app.get("/budget")
def budget_status():
    with db.SessionLocal() as s:
        sp = budget.spent(s)
        return {
            "spent_usd": sp,
            "budget_usd": settings.x_api_budget_usd,
            "remaining_usd": max(0.0, settings.x_api_budget_usd - sp),
        }
