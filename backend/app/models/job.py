from enum import Enum
from pydantic import BaseModel
from .persona import Relationship


class JobStatus(str, Enum):
    queued = "queued"
    claimed = "claimed"
    running = "running"
    done = "done"
    failed = "failed"
    paused_budget = "paused_budget"


class JobPhase(str, Enum):
    resolve = "resolve"
    fetch_followers = "fetch_followers"
    co_engage = "co_engage"
    sample = "sample"
    enrich = "enrich"
    done = "done"


class IngestParams(BaseModel):
    sample_pct: float = 0.2
    max_followers: int = 1000
    posts_per_user: int = 10
    enrich_all: bool = False   # deep-enrich every bio-having tier-1 already in DB (no discovery)


class IngestRequest(BaseModel):
    seed: str
    relationship: Relationship = "follower"
    enrich_all: bool = False
    sample_pct: float = 0.2
    max_followers: int = 1000
    posts_per_user: int = 10
    force: bool = False


class JobProgress(BaseModel):
    discovered: int = 0
    sampled: int = 0
    enriched: int = 0
    failed: int = 0


class IngestJob(BaseModel):
    job_id: str
    seed: str
    seed_account_id: str | None = None
    relationship: Relationship = "follower"
    params: IngestParams
    status: JobStatus = JobStatus.queued
    phase: JobPhase = JobPhase.resolve
    progress: JobProgress = JobProgress()
    member_ids: list[str] = []
    next_token: str | None = None
    cost_usd: float = 0.0
    budget_cap_usd: float = 200.0
    error: str | None = None
    created_at: str
    updated_at: str
