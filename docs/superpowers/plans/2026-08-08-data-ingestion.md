# AgentSim Data Ingestion Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FastAPI ingestion backend (Layer A) that pulls an X account's audience, enriches a sampled subset into `PersonaDocument`s (identity + bio + metrics + content + Grok persona card), and persists them to Postgres/pgvector for the ML layer (B) to embed and cluster.

**Architecture:** A cache-first, budget-metered pipeline driven by a durable `jobs` table + one in-process asyncio worker. Every X call is deduped against a raw JSONB cache and recorded in a cost ledger with a hard spend guard. Two enrichment tiers: tier-1 (all followers, free/inline bio) and tier-2 (sampled deep enrich). Embedding is explicitly B's downstream step — A emits `embedding = null`.

**Tech Stack:** Python 3.11+, uv, FastAPI, SQLAlchemy 2.0 (sync) + psycopg3, pgvector, Pydantic v2, pydantic-settings, tweepy 4.17+, openai SDK (pointed at xAI), pytest + httpx TestClient.

## Global Constraints

- **Python 3.11+**; dependency + venv management via **uv**.
- **Grok model is `grok-4.3` ONLY** — never reference retired IDs (grok-2/3/4, grok-4.1-fast); they silently redirect and overbill. xAI base URL `https://api.x.ai/v1`, auth `Authorization: Bearer $XAI_API_KEY`, OpenAI-SDK-compatible.
- **Embedding is Layer B's** — A never computes vectors, never imports an embedding client, never reads `OPENAI_API_KEY`. A writes `embedding = null`.
- **`schema_version = "1.0"`** on every `PersonaDocument` and `Cluster`.
- **Cache-first / 24h UTC dedup:** never re-fetch a resource already in the raw cache within the same UTC day; a dedup hit records a `$0` ledger row.
- **Budget guard is mandatory:** every paid call passes the cost meter; hard-stop (raise `BudgetExceeded`) when `spent + est_call_cost > soft_limit`. `X_API_BUDGET_USD=250`, `X_API_SPEND_SOFT_LIMIT_USD=200`.
- **X pricing constants (USD), centralized in one module:** followers/following `0.010`/record, user `0.010`/record, post read `0.005`/record, post create `0.015`, post-with-URL `0.200`. (Owned-data discounts ignored for v1.)
- **No live spend in tests** — all X/Grok calls mocked; tests run offline.
- **All timestamps ISO-8601 UTC.**

---

## File Structure

| File | Responsibility |
| --- | --- |
| `backend/pyproject.toml` | deps + pytest config |
| `backend/.env.example` | documented env vars |
| `backend/docker-compose.yml` | Postgres + pgvector |
| `backend/app/config.py` | `Settings` (pydantic-settings) |
| `backend/app/pricing.py` | X pricing constants + `cost_of(resource, count)` |
| `backend/app/models/raw.py` | `RawUser`, `RawTweet` Pydantic models |
| `backend/app/models/persona.py` | `PersonaDocument` + sub-models, `ProfileCard`, `Cluster` |
| `backend/app/models/job.py` | `IngestJob`, `JobStatus`, `JobPhase`, `IngestParams`, `IngestRequest` |
| `backend/app/models/cost.py` | `LedgerEntry` |
| `backend/app/store/db.py` | SQLAlchemy engine/session, ORM tables, `init_db()` |
| `backend/app/store/schema.sql` | reference DDL (tables + pgvector column) |
| `backend/app/store/budget.py` | `record_cost()`, `spent()`, `remaining()`, `guard()`, `BudgetExceeded` |
| `backend/app/store/personas.py` | upsert/query personas + raw cache read/write |
| `backend/app/store/jobs.py` | job CRUD + claim/checkpoint |
| `backend/app/ingest/x_client.py` | tweepy wrapper: resolve, followers, timelines, engagers; cache + cost meter |
| `backend/app/ingest/clean.py` | raw → `content` signature, seed_engagement aggregation |
| `backend/app/ingest/sampler.py` | stratified (engagement-first) tier-2 selection |
| `backend/app/enrich/persona_card.py` | Grok `grok-4.3` structured card + template fallback |
| `backend/app/pipeline.py` | `enrich_tier1()`, `enrich_tier2()` orchestration |
| `backend/app/worker.py` | async job loop: claim → phases → checkpoint → budget pause |
| `backend/app/main.py` | FastAPI app, endpoints, worker startup |
| `backend/app/fixtures/generate.py` | ~100 synthetic `PersonaDocument`s + `clusters.json` |
| `backend/scripts/precompute.py` | pre-ingest demo accounts |
| `frontend/` | Vite/React stub for teammate D |

---

## Task 1: Backend scaffold, config, Postgres, health endpoint

**Files:**
- Create: `backend/pyproject.toml`, `backend/.env.example`, `backend/docker-compose.yml`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/main.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Produces: `app.config.Settings` (attrs: `database_url: str`, `xai_api_key: str`, `x_bearer_token: str`, `x_api_budget_usd: float`, `x_api_spend_soft_limit_usd: float`); `app.main.app` (FastAPI instance) with `GET /health`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_health.py
from fastapi.testclient import TestClient
from app.main import app

def test_health_ok():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: FAIL (ModuleNotFoundError: app.main).

- [ ] **Step 3: Create `pyproject.toml`**

```toml
[project]
name = "agentsim-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.110",
  "uvicorn[standard]>=0.29",
  "pydantic>=2.6",
  "pydantic-settings>=2.2",
  "sqlalchemy>=2.0",
  "psycopg[binary]>=3.1",
  "pgvector>=0.2.5",
  "tweepy>=4.17",
  "openai>=1.30",
  "httpx>=0.27",
]

[dependency-groups]
dev = ["pytest>=8.0"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

- [ ] **Step 4: Create `config.py`**

```python
# backend/app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://agentsim:agentsim@localhost:5432/agentsim"
    xai_api_key: str = ""
    x_bearer_token: str = ""                # maps to X_AI_BEARER_TOKEN below
    x_api_budget_usd: float = 250.0
    x_api_spend_soft_limit_usd: float = 200.0

    # env var name overrides to match existing .env
    model_config = SettingsConfigDict(env_file=".env", extra="ignore",
                                      env_prefix="", populate_by_name=True)

settings = Settings()
```

Note: bind `X_AI_BEARER_TOKEN` via `Field(alias=...)` in a later refinement; for now add `X_AI_BEARER_TOKEN` → `x_bearer_token` with `Field(validation_alias="X_AI_BEARER_TOKEN")`:

```python
from pydantic import Field
# inside Settings:
    x_bearer_token: str = Field(default="", validation_alias="X_AI_BEARER_TOKEN")
    xai_api_key: str = Field(default="", validation_alias="XAI_API_KEY")
```

- [ ] **Step 5: Create `main.py`**

```python
# backend/app/main.py
from fastapi import FastAPI

app = FastAPI(title="AgentSim Ingestion")

@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Create `.env.example` and `docker-compose.yml`**

```bash
# backend/.env.example
X_AI_CONSUMER_KEY=
X_AI_SECRET_KEY=
X_AI_BEARER_TOKEN=
XAI_API_KEY=
DATABASE_URL=postgresql+psycopg://agentsim:agentsim@localhost:5432/agentsim
X_API_BUDGET_USD=250
X_API_SPEND_SOFT_LIMIT_USD=200
```

```yaml
# backend/docker-compose.yml
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: agentsim
      POSTGRES_PASSWORD: agentsim
      POSTGRES_DB: agentsim
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
volumes:
  pgdata:
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/ && git commit -m "feat(ingest): backend scaffold, config, health endpoint"
```

---

## Task 2: Pydantic contracts (the frozen A→B schema)

**Files:**
- Create: `backend/app/models/raw.py`, `backend/app/models/persona.py`, `backend/app/models/job.py`, `backend/app/models/cost.py`, `backend/app/models/__init__.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces:
  - `persona.PersonaDocument` with fields `schema_version, seed_account_id, relationship, enrichment_tier: int, user_id, handle, display_name, profile_url, profile_image_url, account_age_days, verified, verified_type, location, url, bio, metrics: Metrics, seed_engagement: SeedEngagement | None, content: Content | None, persona_card: PersonaCard | None, embedding: Embedding | None`
  - sub-models `Metrics, SeedEngagement, SamplePost, Mention, RefUser, ContextAnnotation, EngagementBreakdown, Content, PersonaCard, Embedding`
  - `persona.ProfileCard`, `persona.Cluster`
  - `raw.RawUser`, `raw.RawTweet`
  - `job.IngestRequest, IngestParams, IngestJob, JobStatus(str,Enum), JobPhase(str,Enum), JobProgress`
  - `cost.LedgerEntry`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_models.py
from app.models.persona import PersonaDocument, PersonaCard

def test_tier1_persona_allows_null_content_and_embedding():
    doc = PersonaDocument(
        schema_version="1.0", seed_account_id="44196397", relationship="follower",
        enrichment_tier=1, user_id="1", handle="@a", display_name="A",
        profile_url="https://x.com/a", profile_image_url="http://img", account_age_days=100,
        verified=False, verified_type=None, location=None, url=None, bio="hi",
        metrics={"followers_count": 1, "following_count": 2, "tweet_count": 3, "listed_count": 0},
        seed_engagement=None, content=None, persona_card=None, embedding=None,
    )
    assert doc.enrichment_tier == 1
    assert doc.content is None and doc.embedding is None

def test_sample_post_carries_entities_and_referenced_user():
    from app.models.persona import SamplePost
    p = SamplePost(text="x", type="quote", created_at="2026-08-05T00:00:00Z",
                   mentions=[{"id": "9", "handle": "@k"}], hashtags=["#e"],
                   referenced_user={"id": "9", "handle": "@k"},
                   metrics={"like": 1, "reply": 0, "repost": 0, "bookmark": 0})
    assert p.referenced_user.handle == "@k"
    assert p.mentions[0].id == "9"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_models.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `persona.py`**

```python
# backend/app/models/persona.py
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel

Relationship = Literal["follower", "following", "seed_topic"]

class Metrics(BaseModel):
    followers_count: int
    following_count: int
    tweet_count: int
    listed_count: int

class SeedEngagement(BaseModel):
    likes_on_seed_posts: int = 0
    replies: int = 0
    reposts: int = 0
    last_engaged_at: str | None = None

class Mention(BaseModel):
    id: str
    handle: str

class RefUser(BaseModel):
    id: str
    handle: str

class EngagementBreakdown(BaseModel):
    like: float = 0
    reply: float = 0
    repost: float = 0
    bookmark: float = 0

class SamplePost(BaseModel):
    text: str
    type: Literal["original", "reply", "repost", "quote"]
    created_at: str
    mentions: list[Mention] = []
    hashtags: list[str] = []
    referenced_user: RefUser | None = None
    metrics: EngagementBreakdown = EngagementBreakdown()

class ContextAnnotation(BaseModel):
    domain: str
    entity: str
    count: int = 1

class Content(BaseModel):
    sample_posts: list[SamplePost] = []
    context_annotations: list[ContextAnnotation] = []
    avg_engagement: EngagementBreakdown = EngagementBreakdown()

class PersonaCard(BaseModel):
    archetype: str
    one_liner: str
    ranked_interests: list[str]
    preferred_formats: list[str]
    tone_affinity: str
    conversion_levers: list[str]
    summary: str

class Embedding(BaseModel):
    embedding_version: str
    model: str
    dim: int
    embed_input: str
    vector: list[float]

class PersonaDocument(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    seed_account_id: str
    relationship: Relationship = "follower"
    enrichment_tier: Literal[1, 2]
    # identity
    user_id: str
    handle: str
    display_name: str
    profile_url: str
    profile_image_url: str
    account_age_days: int
    verified: bool
    verified_type: str | None = None
    location: str | None = None
    url: str | None = None
    bio: str
    metrics: Metrics
    seed_engagement: SeedEngagement | None = None
    content: Content | None = None          # tier 2 only
    persona_card: PersonaCard | None = None  # tier 2 only
    embedding: Embedding | None = None       # B populates

class ProfileCard(BaseModel):
    user_id: str
    handle: str
    display_name: str
    profile_url: str
    profile_image_url: str
    bio: str
    verified: bool
    followers_count: int
    top_sample_post: SamplePost | None = None

class Cluster(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    seed_account_id: str
    cluster_id: str
    label: str
    persona_card: PersonaCard | None = None
    size: int
    share_of_audience: float
    engagement_index: float
    centroid: list[float] = []
    exemplars: list[ProfileCard] = []
    member_ids: list[str] = []
```

- [ ] **Step 4: Implement `raw.py`, `job.py`, `cost.py`**

```python
# backend/app/models/raw.py
from pydantic import BaseModel
from typing import Any

class RawUser(BaseModel):
    user_id: str
    fetched_at: str
    data: dict[str, Any]      # verbatim X user object

class RawTweet(BaseModel):
    tweet_id: str
    author_id: str
    fetched_at: str
    data: dict[str, Any]      # verbatim X tweet object
```

```python
# backend/app/models/job.py
from enum import Enum
from pydantic import BaseModel
from .persona import Relationship

class JobStatus(str, Enum):
    queued = "queued"; running = "running"; done = "done"
    failed = "failed"; paused_budget = "paused_budget"

class JobPhase(str, Enum):
    resolve = "resolve"; fetch_followers = "fetch_followers"; co_engage = "co_engage"
    sample = "sample"; enrich = "enrich"; done = "done"

class IngestParams(BaseModel):
    sample_pct: float = 0.2
    max_followers: int = 1000
    posts_per_user: int = 10

class IngestRequest(BaseModel):
    seed: str
    relationship: Relationship = "follower"
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
```

```python
# backend/app/models/cost.py
from pydantic import BaseModel

class LedgerEntry(BaseModel):
    id: str
    job_id: str | None = None
    provider: str          # "x" | "xai"
    resource: str          # followers | user | post | grok_card | ...
    count: int
    unit_cost_usd: float
    total_usd: float
    dedup_hit: bool = False
    created_at: str
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models tests/test_models.py && git commit -m "feat(ingest): Pydantic contracts (PersonaDocument, Cluster, jobs, cost)"
```

---

## Task 3: Pricing module + cost math

**Files:**
- Create: `backend/app/pricing.py`
- Test: `backend/tests/test_pricing.py`

**Interfaces:**
- Produces: `pricing.UNIT_COST: dict[str, float]`; `pricing.cost_of(resource: str, count: int) -> float`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_pricing.py
from app.pricing import cost_of, UNIT_COST

def test_follower_cost():
    assert cost_of("followers", 100) == 1.00

def test_post_read_cost():
    assert round(cost_of("post", 10), 4) == 0.05

def test_unknown_resource_is_free():
    assert cost_of("mystery", 5) == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_pricing.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `pricing.py`**

```python
# backend/app/pricing.py
UNIT_COST: dict[str, float] = {
    "followers": 0.010, "following": 0.010, "user": 0.010,
    "post": 0.005, "engager": 0.010,      # liking_users / retweeted_by return users
    "post_create": 0.015, "post_create_url": 0.200,
    "grok_card": 0.0,                      # negligible; tracked at 0 for v1
}

def cost_of(resource: str, count: int) -> float:
    return round(UNIT_COST.get(resource, 0.0) * count, 6)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_pricing.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/pricing.py tests/test_pricing.py && git commit -m "feat(ingest): centralized X pricing constants + cost_of()"
```

---

## Task 4: DB layer — engine, ORM tables, init

**Files:**
- Create: `backend/app/store/__init__.py`, `backend/app/store/db.py`, `backend/app/store/schema.sql`
- Test: `backend/tests/test_db.py` (uses a SQLite fallback for CI-free testing OR a live Postgres via `DATABASE_URL`; see note)

**Interfaces:**
- Produces: `db.engine`, `db.SessionLocal`, `db.Base`, ORM classes `RawUserRow, RawTweetRow, PersonaRow, JobRow, LedgerRow`, and `db.init_db()`.
- `PersonaRow` columns: `user_id (PK), seed_account_id, relationship, enrichment_tier, doc (JSONB), vector (Vector, nullable), updated_at`.

**Note:** pgvector needs Postgres. Tests in this task assume a running `docker-compose up -d db`. Keep the vector column nullable so A never writes it.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_db.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && docker-compose up -d db && uv run pytest tests/test_db.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `db.py`**

```python
# backend/app/store/db.py
from datetime import datetime, timezone
from sqlalchemy import create_engine, String, Integer, Float, Boolean, JSON, DateTime, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector
from app.config import settings

engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, future=True, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

def _now() -> datetime:
    return datetime.now(timezone.utc)

class RawUserRow(Base):
    __tablename__ = "raw_users"
    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    data: Mapped[dict] = mapped_column(JSONB)

class RawTweetRow(Base):
    __tablename__ = "raw_tweets"
    tweet_id: Mapped[str] = mapped_column(String, primary_key=True)
    author_id: Mapped[str] = mapped_column(String, index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    data: Mapped[dict] = mapped_column(JSONB)

class PersonaRow(Base):
    __tablename__ = "personas"
    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    seed_account_id: Mapped[str] = mapped_column(String, index=True)
    relationship: Mapped[str] = mapped_column(String, default="follower")
    enrichment_tier: Mapped[int] = mapped_column(Integer, default=1)
    doc: Mapped[dict] = mapped_column(JSONB)
    vector = mapped_column(Vector(), nullable=True)   # B populates; dim set by B later
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

class JobRow(Base):
    __tablename__ = "jobs"
    job_id: Mapped[str] = mapped_column(String, primary_key=True)
    doc: Mapped[dict] = mapped_column(JSONB)          # serialized IngestJob
    status: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

class LedgerRow(Base):
    __tablename__ = "cost_ledger"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    job_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String)
    resource: Mapped[str] = mapped_column(String)
    count: Mapped[int] = mapped_column(Integer)
    unit_cost_usd: Mapped[float] = mapped_column(Float)
    total_usd: Mapped[float] = mapped_column(Float)
    dedup_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

def init_db() -> None:
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(engine)
```

- [ ] **Step 4: Write `schema.sql` (reference DDL, mirrors the ORM)**

```sql
-- backend/app/store/schema.sql  (reference only; init_db() is source of truth)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS raw_users  (user_id TEXT PRIMARY KEY, fetched_at TIMESTAMPTZ, data JSONB);
CREATE TABLE IF NOT EXISTS raw_tweets (tweet_id TEXT PRIMARY KEY, author_id TEXT, fetched_at TIMESTAMPTZ, data JSONB);
CREATE TABLE IF NOT EXISTS personas (
  user_id TEXT PRIMARY KEY, seed_account_id TEXT, relationship TEXT,
  enrichment_tier INT, doc JSONB, vector vector, updated_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, doc JSONB, status TEXT, created_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS cost_ledger (
  id TEXT PRIMARY KEY, job_id TEXT, provider TEXT, resource TEXT, count INT,
  unit_cost_usd DOUBLE PRECISION, total_usd DOUBLE PRECISION, dedup_hit BOOLEAN, created_at TIMESTAMPTZ);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_db.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/store tests/test_db.py && git commit -m "feat(ingest): Postgres/pgvector DB layer with nullable vector column"
```

---

## Task 5: Cost ledger + budget guard

**Files:**
- Create: `backend/app/store/budget.py`
- Test: `backend/tests/test_budget.py`

**Interfaces:**
- Consumes: `db.SessionLocal`, `db.LedgerRow`, `pricing.cost_of`.
- Produces: `budget.BudgetExceeded(Exception)`; `budget.record_cost(session, *, resource, count, provider="x", job_id=None, dedup_hit=False) -> float`; `budget.spent(session) -> float`; `budget.remaining(session, cap) -> float`; `budget.guard(session, *, resource, count, soft_limit)` (raises `BudgetExceeded` if the call would breach).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_budget.py
import pytest
from app.store import db, budget

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        s.query(db.LedgerRow).delete(); s.commit()
    yield

def test_dedup_hit_is_free_and_spent_sums():
    with db.SessionLocal() as s:
        budget.record_cost(s, resource="followers", count=100)         # $1.00
        budget.record_cost(s, resource="followers", count=100, dedup_hit=True)  # $0
        s.commit()
        assert budget.spent(s) == 1.00

def test_guard_trips_before_soft_limit():
    with db.SessionLocal() as s:
        budget.record_cost(s, resource="followers", count=100); s.commit()  # $1
        with pytest.raises(budget.BudgetExceeded):
            budget.guard(s, resource="post", count=1000, soft_limit=1.50)   # +$5 > $1.50
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_budget.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `budget.py`**

```python
# backend/app/store/budget.py
import uuid
from sqlalchemy import select, func
from app.store import db
from app.pricing import cost_of

class BudgetExceeded(Exception):
    pass

def record_cost(session, *, resource, count, provider="x", job_id=None, dedup_hit=False) -> float:
    total = 0.0 if dedup_hit else cost_of(resource, count)
    session.add(db.LedgerRow(
        id=str(uuid.uuid4()), job_id=job_id, provider=provider, resource=resource,
        count=count, unit_cost_usd=cost_of(resource, 1), total_usd=total, dedup_hit=dedup_hit,
    ))
    return total

def spent(session) -> float:
    return float(session.execute(select(func.coalesce(func.sum(db.LedgerRow.total_usd), 0.0))).scalar_one())

def remaining(session, cap: float) -> float:
    return max(0.0, cap - spent(session))

def guard(session, *, resource, count, soft_limit: float) -> None:
    if spent(session) + cost_of(resource, count) > soft_limit:
        raise BudgetExceeded(f"{resource}x{count} would breach soft limit {soft_limit}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_budget.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/store/budget.py tests/test_budget.py && git commit -m "feat(ingest): cost ledger + budget guard with dedup accounting"
```

---

## Task 6: Raw cache + persona store

**Files:**
- Create: `backend/app/store/personas.py`
- Test: `backend/tests/test_persona_store.py`

**Interfaces:**
- Consumes: `db`, `models.persona.PersonaDocument`.
- Produces:
  - `personas.get_cached_user(session, user_id) -> dict | None` (raw), `cache_user(session, user_id, data)`
  - `personas.get_cached_tweets(session, author_id) -> list[dict] | None`, `cache_tweets(session, author_id, tweets: list[dict])`
  - `personas.upsert_persona(session, doc: PersonaDocument)` (writes `doc.model_dump()` to `PersonaRow.doc`, sets tier/seed; leaves `vector=None`)
  - `personas.get_persona(session, user_id) -> PersonaDocument | None`
  - `personas.list_personas(session, seed_account_id, limit, offset) -> list[PersonaDocument]`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_persona_store.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_persona_store.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `personas.py`**

```python
# backend/app/store/personas.py
from datetime import datetime, timezone
from sqlalchemy import select
from app.store import db
from app.models.persona import PersonaDocument

def _now_iso():
    return datetime.now(timezone.utc).isoformat()

def get_cached_user(session, user_id: str) -> dict | None:
    row = session.get(db.RawUserRow, user_id)
    return row.data if row else None

def cache_user(session, user_id: str, data: dict) -> None:
    session.merge(db.RawUserRow(user_id=user_id, data=data))

def get_cached_tweets(session, author_id: str) -> list[dict] | None:
    rows = session.execute(
        select(db.RawTweetRow).where(db.RawTweetRow.author_id == author_id)
    ).scalars().all()
    return [r.data for r in rows] if rows else None

def cache_tweets(session, author_id: str, tweets: list[dict]) -> None:
    for t in tweets:
        session.merge(db.RawTweetRow(tweet_id=str(t["id"]), author_id=author_id, data=t))

def upsert_persona(session, doc: PersonaDocument) -> None:
    session.merge(db.PersonaRow(
        user_id=doc.user_id, seed_account_id=doc.seed_account_id,
        relationship=doc.relationship, enrichment_tier=doc.enrichment_tier,
        doc=doc.model_dump(), vector=None,
    ))

def get_persona(session, user_id: str) -> PersonaDocument | None:
    row = session.get(db.PersonaRow, user_id)
    return PersonaDocument(**row.doc) if row else None

def list_personas(session, seed_account_id: str, limit: int = 100, offset: int = 0):
    rows = session.execute(
        select(db.PersonaRow).where(db.PersonaRow.seed_account_id == seed_account_id)
        .limit(limit).offset(offset)
    ).scalars().all()
    return [PersonaDocument(**r.doc) for r in rows]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_persona_store.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/store/personas.py tests/test_persona_store.py && git commit -m "feat(ingest): raw cache + persona upsert/query store"
```

---

## Task 7: Cleaner — raw → content signature + seed_engagement

**Files:**
- Create: `backend/app/ingest/__init__.py`, `backend/app/ingest/clean.py`
- Test: `backend/tests/test_clean.py`

**Interfaces:**
- Consumes: `models.persona` sub-models.
- Produces:
  - `clean.build_identity(raw_user: dict, seed_account_id: str, tier: int) -> dict` (kwargs for `PersonaDocument` identity+bio+metrics)
  - `clean.classify_post(raw_tweet: dict) -> SamplePost`
  - `clean.build_content(raw_tweets: list[dict]) -> Content` (posts + frequency-weighted `context_annotations` + `avg_engagement`)
  - `clean.aggregate_seed_engagement(user_id: str, engagers: dict) -> SeedEngagement` where `engagers = {"likes": set[str], "reposts": set[str], "replies": set[str], "last": dict[str,str]}`
  - `clean.account_age_days(created_at: str, now_iso: str) -> int`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_clean.py
from app.ingest import clean

def test_classify_repost_captures_referenced_user():
    raw = {
        "id": "5", "text": "RT ...", "created_at": "2026-08-05T00:00:00Z",
        "referenced_tweets": [{"type": "retweeted", "id": "9"}],
        "entities": {"mentions": [{"id": "77", "username": "karpathy"}], "hashtags": [{"tag": "evals"}]},
        "public_metrics": {"like_count": 3, "reply_count": 0, "retweet_count": 1, "bookmark_count": 0},
        "_referenced_user": {"id": "77", "handle": "@karpathy"},
    }
    post = clean.classify_post(raw)
    assert post.type == "repost"
    assert post.referenced_user.handle == "@karpathy"
    assert post.hashtags == ["evals"]

def test_context_annotations_frequency_weighted():
    raws = []
    for i in range(3):
        raws.append({"id": str(i), "text": "x", "created_at": "2026-08-05T00:00:00Z",
                     "public_metrics": {"like_count": 0, "reply_count": 0, "retweet_count": 0, "bookmark_count": 0},
                     "context_annotations": [{"domain": {"name": "Technology"}, "entity": {"name": "AI"}}]})
    content = clean.build_content(raws)
    ai = [c for c in content.context_annotations if c.entity == "AI"][0]
    assert ai.count == 3

def test_seed_engagement_aggregation():
    engagers = {"likes": {"u1"}, "reposts": {"u1"}, "replies": set(),
                "last": {"u1": "2026-08-06T00:00:00Z"}}
    se = clean.aggregate_seed_engagement("u1", engagers)
    assert se.likes_on_seed_posts == 1 and se.reposts == 1 and se.last_engaged_at == "2026-08-06T00:00:00Z"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_clean.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `clean.py`**

```python
# backend/app/ingest/clean.py
from collections import Counter
from datetime import datetime
from app.models.persona import (
    SamplePost, Content, ContextAnnotation, EngagementBreakdown,
    SeedEngagement, Mention, RefUser, Metrics,
)

_REF_TYPE = {"retweeted": "repost", "quoted": "quote", "replied_to": "reply"}

def account_age_days(created_at: str, now_iso: str) -> int:
    a = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    b = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
    return max(0, (b - a).days)

def classify_post(raw: dict) -> SamplePost:
    refs = raw.get("referenced_tweets") or []
    ptype = "original"
    for r in refs:
        if r["type"] in _REF_TYPE:
            ptype = _REF_TYPE[r["type"]]; break
    ents = raw.get("entities") or {}
    mentions = [Mention(id=str(m.get("id", "")), handle="@" + m["username"])
                for m in ents.get("mentions", []) if m.get("username")]
    hashtags = [h["tag"] for h in ents.get("hashtags", [])]
    ru = raw.get("_referenced_user")
    referenced_user = RefUser(**ru) if ru else None
    pm = raw.get("public_metrics", {})
    return SamplePost(
        text=raw.get("text", ""), type=ptype, created_at=raw["created_at"],
        mentions=mentions, hashtags=hashtags, referenced_user=referenced_user,
        metrics=EngagementBreakdown(
            like=pm.get("like_count", 0), reply=pm.get("reply_count", 0),
            repost=pm.get("retweet_count", 0), bookmark=pm.get("bookmark_count", 0)),
    )

def build_content(raw_tweets: list[dict]) -> Content:
    posts = [classify_post(t) for t in raw_tweets]
    ann = Counter()
    for t in raw_tweets:
        for ca in t.get("context_annotations") or []:
            ann[(ca["domain"]["name"], ca["entity"]["name"])] += 1
    annotations = [ContextAnnotation(domain=d, entity=e, count=c) for (d, e), c in ann.items()]
    n = max(1, len(posts))
    avg = EngagementBreakdown(
        like=sum(p.metrics.like for p in posts) / n,
        reply=sum(p.metrics.reply for p in posts) / n,
        repost=sum(p.metrics.repost for p in posts) / n,
        bookmark=sum(p.metrics.bookmark for p in posts) / n,
    )
    return Content(sample_posts=posts, context_annotations=annotations, avg_engagement=avg)

def aggregate_seed_engagement(user_id: str, engagers: dict) -> SeedEngagement:
    return SeedEngagement(
        likes_on_seed_posts=1 if user_id in engagers["likes"] else 0,
        reposts=1 if user_id in engagers["reposts"] else 0,
        replies=1 if user_id in engagers["replies"] else 0,
        last_engaged_at=engagers["last"].get(user_id),
    )

def build_identity(raw_user: dict, seed_account_id: str, tier: int, now_iso: str) -> dict:
    pm = raw_user.get("public_metrics", {})
    return dict(
        seed_account_id=seed_account_id, enrichment_tier=tier,
        user_id=str(raw_user["id"]), handle="@" + raw_user["username"],
        display_name=raw_user.get("name", ""),
        profile_url=f"https://x.com/{raw_user['username']}",
        profile_image_url=raw_user.get("profile_image_url", ""),
        account_age_days=account_age_days(raw_user["created_at"], now_iso),
        verified=raw_user.get("verified", False),
        verified_type=raw_user.get("verified_type"),
        location=raw_user.get("location"), url=raw_user.get("url"),
        bio=raw_user.get("description", ""),
        metrics=Metrics(
            followers_count=pm.get("followers_count", 0),
            following_count=pm.get("following_count", 0),
            tweet_count=pm.get("tweet_count", 0),
            listed_count=pm.get("listed_count", 0)),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_clean.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingest/clean.py tests/test_clean.py && git commit -m "feat(ingest): cleaner — post typing, entities, freq-weighted annotations, seed_engagement"
```

---

## Task 8: X client wrapper (cache + cost meter, mockable)

**Files:**
- Create: `backend/app/ingest/x_client.py`
- Test: `backend/tests/test_x_client.py`

**Interfaces:**
- Consumes: `store.personas` (cache), `store.budget` (guard + record), `config.settings`.
- Produces: `x_client.XClient` with an injectable `api` (tweepy client or fake):
  - `resolve_user(session, handle_or_id) -> dict` (raw user)
  - `fetch_followers(session, seed_id, max_followers, job_id) -> list[dict]` (raw users; caches each; records cost per page)
  - `fetch_timeline(session, user_id, max_results, job_id) -> list[dict]` (cache-first; dedup-free on hit)
  - `fetch_engagers(session, post_ids, job_id) -> dict` (likes/reposts sets + last map)
- Cache-first rule: if `get_cached_*` returns data, record a `dedup_hit=True` ($0) ledger row and skip the API.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_x_client.py
import pytest
from app.store import db, budget, personas
from app.ingest.x_client import XClient

class FakeAPI:
    def __init__(self): self.calls = 0
    def get_users_tweets(self, user_id, **kw):
        self.calls += 1
        return [{"id": "1", "text": "hi", "created_at": "2026-08-05T00:00:00Z",
                 "public_metrics": {"like_count": 1, "reply_count": 0, "retweet_count": 0, "bookmark_count": 0}}]

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        s.query(db.RawTweetRow).delete(); s.query(db.LedgerRow).delete(); s.commit()
    yield

def test_timeline_cache_hit_avoids_second_api_call_and_is_free():
    api = FakeAPI(); client = XClient(api=api)
    with db.SessionLocal() as s:
        client.fetch_timeline(s, "u1", max_results=10, job_id="j"); s.commit()
        first_spent = budget.spent(s)
        client.fetch_timeline(s, "u1", max_results=10, job_id="j"); s.commit()
    assert api.calls == 1                       # second call served from cache
    with db.SessionLocal() as s:
        assert budget.spent(s) == first_spent   # dedup hit added $0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_x_client.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `x_client.py`**

```python
# backend/app/ingest/x_client.py
from app.config import settings
from app.store import personas, budget

class XClient:
    def __init__(self, api=None, soft_limit: float | None = None):
        self.api = api                       # tweepy.Client or a fake
        self.soft_limit = soft_limit if soft_limit is not None else settings.x_api_spend_soft_limit_usd

    def fetch_timeline(self, session, user_id: str, max_results: int, job_id: str) -> list[dict]:
        cached = personas.get_cached_tweets(session, user_id)
        if cached is not None:
            budget.record_cost(session, resource="post", count=len(cached), job_id=job_id, dedup_hit=True)
            return cached
        budget.guard(session, resource="post", count=max_results, soft_limit=self.soft_limit)
        tweets = list(self.api.get_users_tweets(user_id, max_results=max_results) or [])
        budget.record_cost(session, resource="post", count=len(tweets), job_id=job_id)
        personas.cache_tweets(session, user_id, tweets)
        return tweets

    def resolve_user(self, session, handle_or_id: str) -> dict:
        # handle "@name" or numeric id; cache by resolved id
        user = self.api.get_user(handle_or_id)     # fake/tweepy returns a dict
        personas.cache_user(session, str(user["id"]), user)
        budget.record_cost(session, resource="user", count=1)
        return user

    def fetch_followers(self, session, seed_id: str, max_followers: int, job_id: str) -> list[dict]:
        out = []
        for page in self.api.get_users_followers(seed_id, max_followers=max_followers):
            for u in page:
                personas.cache_user(session, str(u["id"]), u)
                out.append(u)
            budget.record_cost(session, resource="followers", count=len(page), job_id=job_id)
            if len(out) >= max_followers:
                break
        return out[:max_followers]

    def fetch_engagers(self, session, post_ids: list[str], job_id: str) -> dict:
        likes, reposts, last = set(), set(), {}
        for pid in post_ids:
            for u in self.api.get_liking_users(pid) or []:
                likes.add(str(u["id"])); last[str(u["id"])] = u.get("_engaged_at", "")
                budget.record_cost(session, resource="engager", count=1, job_id=job_id)
            for u in self.api.get_retweeters(pid) or []:
                reposts.add(str(u["id"])); last[str(u["id"])] = u.get("_engaged_at", "")
                budget.record_cost(session, resource="engager", count=1, job_id=job_id)
        return {"likes": likes, "reposts": reposts, "replies": set(), "last": last}
```

Note: the real tweepy adapter (mapping `tweepy.Client` responses to plain dicts + a `_referenced_user` resolver from `includes`) is wired in Task 11's integration; the fake API keeps unit tests offline.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_x_client.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingest/x_client.py tests/test_x_client.py && git commit -m "feat(ingest): X client wrapper with cache-first dedup + cost metering"
```

---

## Task 9: Persona card (Grok grok-4.3 + deterministic fallback)

**Files:**
- Create: `backend/app/enrich/__init__.py`, `backend/app/enrich/persona_card.py`
- Test: `backend/tests/test_persona_card.py`

**Interfaces:**
- Consumes: `models.persona.PersonaCard, Content`.
- Produces:
  - `persona_card.template_card(bio: str, content: Content) -> PersonaCard` (deterministic; no network)
  - `persona_card.generate_card(bio, content, client=None) -> PersonaCard` (Grok `grok-4.3` structured output via `client.beta.chat.completions.parse`; falls back to `template_card` on any error or when `client is None`)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_persona_card.py
from app.enrich import persona_card
from app.models.persona import Content, ContextAnnotation

def test_template_card_is_valid_without_network():
    content = Content(context_annotations=[ContextAnnotation(domain="Technology", entity="Rust", count=5)])
    card = persona_card.template_card("Rust dev, skeptical of hype", content)
    assert card.summary
    assert "Rust" in card.ranked_interests

def test_generate_card_falls_back_when_client_none():
    card = persona_card.generate_card("bio", Content(), client=None)
    assert card.archetype  # produced by fallback
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_persona_card.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `persona_card.py`**

```python
# backend/app/enrich/persona_card.py
from app.models.persona import PersonaCard, Content

GROK_MODEL = "grok-4.3"   # NEVER a retired id
_SYSTEM = ("Summarize this X user into a persona card for launch targeting. "
           "Be concrete and grounded in their bio and posts.")

def template_card(bio: str, content: Content) -> PersonaCard:
    interests = [c.entity for c in sorted(content.context_annotations, key=lambda c: -c.count)][:6]
    if not interests:
        interests = [w for w in bio.replace(",", " ").split() if len(w) > 4][:4] or ["general"]
    return PersonaCard(
        archetype="engaged follower",
        one_liner=(bio[:120] or "An engaged member of the audience."),
        ranked_interests=interests,
        preferred_formats=["threads", "images"],
        tone_affinity="neutral",
        conversion_levers=["clear value", "social proof"],
        summary=f"Interested in {', '.join(interests)}. Bio: {bio[:200]}",
    )

def generate_card(bio: str, content: Content, client=None) -> PersonaCard:
    if client is None:
        return template_card(bio, content)
    try:
        posts = "\n".join(p.text for p in content.sample_posts[:8])
        topics = ", ".join(f"{c.entity}({c.count})" for c in content.context_annotations)
        completion = client.beta.chat.completions.parse(
            model=GROK_MODEL,
            messages=[{"role": "system", "content": _SYSTEM},
                      {"role": "user", "content": f"BIO:\n{bio}\n\nTOPICS:\n{topics}\n\nPOSTS:\n{posts}"}],
            response_format=PersonaCard,
        )
        return completion.choices[0].message.parsed
    except Exception:
        return template_card(bio, content)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_persona_card.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/enrich tests/test_persona_card.py && git commit -m "feat(ingest): Grok grok-4.3 persona card with deterministic fallback"
```

---

## Task 10: Sampler (stratified, engagement-first)

**Files:**
- Create: `backend/app/ingest/sampler.py`
- Test: `backend/tests/test_sampler.py`

**Interfaces:**
- Consumes: `models.persona.PersonaDocument` (tier-1 docs, each may have `seed_engagement`).
- Produces: `sampler.select_tier2(tier1_docs: list[PersonaDocument], sample_pct: float, min_n: int = 100) -> list[str]` (returns `user_id`s), ranking by: (1) any seed engagement, (2) followers_count, (3) recency proxy (tweet_count); skips `protected`/empty-bio accounts.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sampler.py
from app.ingest import sampler
from app.models.persona import PersonaDocument, SeedEngagement

def _doc(uid, followers, engaged=False, bio="hi"):
    return PersonaDocument(
        seed_account_id="s", enrichment_tier=1, user_id=uid, handle="@"+uid, display_name=uid,
        profile_url="https://x.com/"+uid, profile_image_url="i", account_age_days=1,
        verified=False, bio=bio,
        metrics={"followers_count": followers, "following_count": 1, "tweet_count": 1, "listed_count": 0},
        seed_engagement=SeedEngagement(likes_on_seed_posts=1) if engaged else None,
    )

def test_engaged_followers_ranked_first():
    docs = [_doc("a", 10000), _doc("b", 5, engaged=True), _doc("c", 50)]
    picked = sampler.select_tier2(docs, sample_pct=0.34, min_n=1)
    assert picked[0] == "b"      # engaged wins despite low followers

def test_min_n_floor_and_skips_empty_bio():
    docs = [_doc(str(i), i) for i in range(200)] + [_doc("empty", 999, bio="")]
    picked = sampler.select_tier2(docs, sample_pct=0.2, min_n=100)
    assert len(picked) >= 100
    assert "empty" not in picked
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_sampler.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `sampler.py`**

```python
# backend/app/ingest/sampler.py
from app.models.persona import PersonaDocument

def _score(d: PersonaDocument) -> tuple:
    se = d.seed_engagement
    engaged = (se.likes_on_seed_posts + se.replies + se.reposts) if se else 0
    return (engaged, d.metrics.followers_count, d.metrics.tweet_count)

def select_tier2(tier1_docs: list[PersonaDocument], sample_pct: float, min_n: int = 100) -> list[str]:
    eligible = [d for d in tier1_docs if d.bio.strip()]
    ranked = sorted(eligible, key=_score, reverse=True)
    target = max(min_n, int(len(tier1_docs) * sample_pct))
    return [d.user_id for d in ranked[:target]]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_sampler.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingest/sampler.py tests/test_sampler.py && git commit -m "feat(ingest): engagement-first stratified tier-2 sampler"
```

---

## Task 11: Pipeline + worker (job lifecycle end-to-end)

**Files:**
- Create: `backend/app/pipeline.py`, `backend/app/store/jobs.py`, `backend/app/worker.py`
- Test: `backend/tests/test_worker.py`

**Interfaces:**
- Consumes: `x_client.XClient`, `clean`, `sampler`, `persona_card`, `store.personas`, `store.budget`, `store.jobs`.
- Produces:
  - `jobs.create_job(session, req: IngestRequest) -> IngestJob`; `jobs.get_job(session, job_id) -> IngestJob | None`; `jobs.find_done(session, seed_account_id, relationship) -> IngestJob | None`; `jobs.save(session, job)`; `jobs.claim_next(session) -> IngestJob | None`.
  - `pipeline.enrich_tier1(session, raw_user, seed_id) -> PersonaDocument`
  - `pipeline.enrich_tier2(session, user_id, seed_id, xclient, grok_client, posts_per_user, engagers) -> PersonaDocument`
  - `worker.run_job(session, job, xclient, grok_client=None) -> IngestJob` (executes phases; catches `BudgetExceeded` → `paused_budget`)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_worker.py
import pytest
from app.store import db, jobs, personas
from app.models.job import IngestRequest
from app.ingest.x_client import XClient
from app import worker

class FakeAPI:
    def get_user(self, h): return {"id": "seed", "username": "seed", "name": "Seed",
        "created_at": "2020-01-01T00:00:00Z", "public_metrics": {"followers_count": 3,
        "following_count": 0, "tweet_count": 0, "listed_count": 0}}
    def get_users_followers(self, sid, **kw):
        yield [{"id": f"u{i}", "username": f"u{i}", "name": f"U{i}",
                "description": "rust dev", "created_at": "2021-01-01T00:00:00Z",
                "public_metrics": {"followers_count": i, "following_count": 1,
                                   "tweet_count": 5, "listed_count": 0}} for i in range(3)]
    def get_recent_seed_posts(self, sid, **kw): return ["p1"]
    def get_liking_users(self, pid): return [{"id": "u2", "_engaged_at": "2026-08-06T00:00:00Z"}]
    def get_retweeters(self, pid): return []
    def get_users_tweets(self, uid, **kw):
        return [{"id": f"{uid}-t", "text": "rust is great", "created_at": "2026-08-05T00:00:00Z",
                 "public_metrics": {"like_count": 2, "reply_count": 0, "retweet_count": 0, "bookmark_count": 0},
                 "context_annotations": [{"domain": {"name": "Tech"}, "entity": {"name": "Rust"}}]}]

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        for t in (db.PersonaRow, db.JobRow, db.LedgerRow, db.RawUserRow, db.RawTweetRow):
            s.query(t).delete()
        s.commit()
    yield

def test_worker_runs_job_end_to_end():
    with db.SessionLocal() as s:
        job = jobs.create_job(s, IngestRequest(seed="@seed", sample_pct=1.0, max_followers=3)); s.commit()
        xclient = XClient(api=FakeAPI(), soft_limit=1000)
        done = worker.run_job(s, job, xclient, grok_client=None); s.commit()
        assert done.status.value == "done"
        assert done.progress.discovered == 3
        # tier-1 written for all, tier-2 for the sampled set
        u2 = personas.get_persona(s, "u2")
        assert u2.enrichment_tier == 2 and u2.content is not None
        assert u2.seed_engagement.likes_on_seed_posts == 1   # u2 liked seed post
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_worker.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `jobs.py`**

```python
# backend/app/store/jobs.py
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
```

- [ ] **Step 4: Implement `pipeline.py`**

```python
# backend/app/pipeline.py
from datetime import datetime, timezone
from app.ingest import clean
from app.enrich import persona_card
from app.store import personas
from app.models.persona import PersonaDocument

def _now_iso(): return datetime.now(timezone.utc).isoformat()

def enrich_tier1(session, raw_user: dict, seed_id: str) -> PersonaDocument:
    ident = clean.build_identity(raw_user, seed_id, tier=1, now_iso=_now_iso())
    doc = PersonaDocument(**ident)
    personas.upsert_persona(session, doc)
    return doc

def enrich_tier2(session, user_id, seed_id, xclient, grok_client, posts_per_user, engagers, job_id):
    existing = personas.get_persona(session, user_id)
    if existing and existing.enrichment_tier == 2:
        return existing                     # idempotent skip
    raw_user = personas.get_cached_user(session, user_id)
    ident = clean.build_identity(raw_user, seed_id, tier=2, now_iso=_now_iso())
    tweets = xclient.fetch_timeline(session, user_id, max_results=posts_per_user, job_id=job_id)
    content = clean.build_content(tweets)
    card = persona_card.generate_card(ident["bio"], content, client=grok_client)
    se = clean.aggregate_seed_engagement(user_id, engagers)
    doc = PersonaDocument(**ident, content=content, persona_card=card, seed_engagement=se)
    personas.upsert_persona(session, doc)
    return doc
```

- [ ] **Step 5: Implement `worker.py` (`run_job`)**

```python
# backend/app/worker.py
from app.models.job import JobStatus, JobPhase
from app.store import jobs, budget
from app.ingest import sampler
from app import pipeline

def run_job(session, job, xclient, grok_client=None):
    try:
        job.status = JobStatus.running

        # resolve
        job.phase = JobPhase.resolve
        seed = xclient.resolve_user(session, job.seed)
        job.seed_account_id = str(seed["id"]); jobs.save(session, job); session.commit()

        # fetch followers -> tier 1
        job.phase = JobPhase.fetch_followers
        raw_followers = xclient.fetch_followers(session, job.seed_account_id,
                                                job.params.max_followers, job.job_id)
        tier1 = [pipeline.enrich_tier1(session, u, job.seed_account_id) for u in raw_followers]
        job.progress.discovered = len(tier1); jobs.save(session, job); session.commit()

        # co-engagement
        job.phase = JobPhase.co_engage
        post_ids = xclient.api.get_recent_seed_posts(job.seed_account_id)
        engagers = xclient.fetch_engagers(session, post_ids, job.job_id)

        # re-load tier1 docs with seed_engagement for sampling
        from app.store import personas
        docs = [personas.get_persona(session, d.user_id) for d in tier1]
        for d in docs:
            d.seed_engagement = pipeline.clean.aggregate_seed_engagement(d.user_id, engagers)

        # sample
        job.phase = JobPhase.sample
        job.member_ids = sampler.select_tier2(docs, job.params.sample_pct, min_n=min(100, len(docs)))
        job.progress.sampled = len(job.member_ids); jobs.save(session, job); session.commit()

        # enrich tier 2
        job.phase = JobPhase.enrich
        for uid in job.member_ids:
            try:
                pipeline.enrich_tier2(session, uid, job.seed_account_id, xclient,
                                      grok_client, job.params.posts_per_user, engagers, job.job_id)
                job.progress.enriched += 1
            except budget.BudgetExceeded:
                job.status = JobStatus.paused_budget
                job.error = "soft budget limit reached"; jobs.save(session, job); session.commit()
                return job
            except Exception as e:
                job.progress.failed += 1; job.error = str(e)
            jobs.save(session, job); session.commit()

        job.phase = JobPhase.done; job.status = JobStatus.done
        jobs.save(session, job); session.commit()
        return job
    except budget.BudgetExceeded:
        job.status = JobStatus.paused_budget; jobs.save(session, job); session.commit(); return job
    except Exception as e:
        job.status = JobStatus.failed; job.error = str(e); jobs.save(session, job); session.commit(); return job
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_worker.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/pipeline.py backend/app/store/jobs.py backend/app/worker.py tests/test_worker.py && git commit -m "feat(ingest): job lifecycle — pipeline (tier1/tier2) + worker phases + budget pause"
```

---

## Task 12: FastAPI endpoints + background worker loop

**Files:**
- Modify: `backend/app/main.py`
- Create: `backend/app/store/clusters_stub.py`
- Test: `backend/tests/test_api.py`

**Interfaces:**
- Consumes: everything above; a real tweepy adapter behind `x_client`.
- Produces endpoints: `POST /ingest`, `GET /ingest/{job_id}`, `GET /ingest`, `GET /personas`, `GET /clusters`, `GET /budget`, `GET /health`.
- `worker_loop()` async task started on FastAPI startup: claims one job at a time and runs it in a thread executor.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_api.py
import pytest
from fastapi.testclient import TestClient
from app.store import db

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        for t in (db.PersonaRow, db.JobRow, db.LedgerRow):
            s.query(t).delete()
        s.commit()
    yield

def test_ingest_creates_queued_job():
    from app.main import app
    client = TestClient(app)
    resp = client.post("/ingest", json={"seed": "@seed", "max_followers": 3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "queued" and body["job_id"]
    got = client.get(f"/ingest/{body['job_id']}")
    assert got.status_code == 200

def test_clusters_stub_returns_fixtures():
    from app.main import app
    client = TestClient(app)
    resp = client.get("/clusters")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_api.py -v`
Expected: FAIL (endpoints missing).

- [ ] **Step 3: Implement `clusters_stub.py`**

```python
# backend/app/store/clusters_stub.py
import json, pathlib
_FIX = pathlib.Path(__file__).parent.parent / "fixtures" / "clusters.json"

def load_clusters() -> list[dict]:
    if _FIX.exists():
        return json.loads(_FIX.read_text())
    return []
```

- [ ] **Step 4: Extend `main.py`**

```python
# backend/app/main.py
import asyncio, contextlib
from fastapi import FastAPI, HTTPException
from app.store import db, jobs, personas, budget, clusters_stub
from app.models.job import IngestRequest, JobStatus
from app.config import settings

app = FastAPI(title="AgentSim Ingestion")

@app.on_event("startup")
def _startup():
    db.init_db()
    app.state.worker = asyncio.create_task(worker_loop())

@app.on_event("shutdown")
async def _shutdown():
    app.state.worker.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await app.state.worker

async def worker_loop():
    from app import worker as w
    from app.ingest.x_client import XClient
    from app.ingest.tweepy_adapter import make_api, make_grok  # Task 12 note below
    while True:
        await asyncio.sleep(1.0)
        with db.SessionLocal() as s:
            job = jobs.claim_next(s)
            if not job:
                continue
        def _run():
            with db.SessionLocal() as s2:
                job2 = jobs.get_job(s2, job.job_id)
                w.run_job(s2, job2, XClient(api=make_api()), grok_client=make_grok())
        await asyncio.get_running_loop().run_in_executor(None, _run)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ingest")
def ingest(req: IngestRequest):
    with db.SessionLocal() as s:
        job = jobs.create_job(s, req); s.commit()
        return {"job_id": job.job_id, "status": job.status.value}

@app.get("/ingest/{job_id}")
def ingest_status(job_id: str):
    with db.SessionLocal() as s:
        job = jobs.get_job(s, job_id)
        if not job:
            raise HTTPException(404)
        return job.model_dump(mode="json")

@app.get("/ingest")
def ingest_list():
    with db.SessionLocal() as s:
        rows = s.query(db.JobRow).order_by(db.JobRow.created_at.desc()).limit(50).all()
        return [r.doc for r in rows]

@app.get("/personas")
def list_personas(seed_account_id: str, limit: int = 100, offset: int = 0):
    with db.SessionLocal() as s:
        return [d.model_dump(mode="json") for d in personas.list_personas(s, seed_account_id, limit, offset)]

@app.get("/clusters")
def clusters():
    return clusters_stub.load_clusters()

@app.get("/budget")
def budget_status():
    with db.SessionLocal() as s:
        sp = budget.spent(s)
        return {"spent_usd": sp, "budget_usd": settings.x_api_budget_usd,
                "remaining_usd": max(0.0, settings.x_api_budget_usd - sp)}
```

Note: create a thin `backend/app/ingest/tweepy_adapter.py` with `make_api()` returning a tweepy-backed object whose methods (`get_user`, `get_users_followers`, `get_users_tweets`, `get_liking_users`, `get_retweeters`, `get_recent_seed_posts`) return plain dicts (map `tweepy` objects via `.data`, attach `_referenced_user` from `includes.users`), and `make_grok()` returning `openai.OpenAI(base_url="https://api.x.ai/v1", api_key=settings.xai_api_key)` or `None` if the key is empty. Cover it with one adapter unit test using a stubbed `tweepy.Client`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_api.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/app/store/clusters_stub.py backend/app/ingest/tweepy_adapter.py tests/test_api.py && git commit -m "feat(ingest): FastAPI endpoints + background worker loop + clusters stub"
```

---

## Task 13: Fixtures generator + frontend stub

**Files:**
- Create: `backend/app/fixtures/__init__.py`, `backend/app/fixtures/generate.py`, `backend/scripts/precompute.py`, `frontend/package.json`, `frontend/README.md`
- Test: `backend/tests/test_fixtures.py`

**Interfaces:**
- Produces: `fixtures.generate.make_personas(n=100) -> list[PersonaDocument]`; `fixtures.generate.make_clusters(personas) -> list[Cluster]`; a `--write` CLI that dumps `fixtures/personas.json` + `fixtures/clusters.json`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_fixtures.py
from app.fixtures import generate
from app.models.persona import PersonaDocument, Cluster

def test_generated_personas_validate_and_mix_tiers():
    docs = generate.make_personas(n=100)
    assert len(docs) == 100
    assert all(isinstance(d, PersonaDocument) for d in docs)
    assert any(d.enrichment_tier == 2 for d in docs)
    assert any(d.enrichment_tier == 1 for d in docs)

def test_generated_clusters_have_profile_exemplars():
    docs = generate.make_personas(n=100)
    clusters = generate.make_clusters(docs)
    assert clusters and all(isinstance(c, Cluster) for c in clusters)
    assert clusters[0].exemplars and clusters[0].exemplars[0].handle
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_fixtures.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Implement `generate.py`**

```python
# backend/app/fixtures/generate.py
import json, pathlib, argparse
from app.models.persona import (PersonaDocument, Metrics, Content, ContextAnnotation,
                                PersonaCard, SamplePost, EngagementBreakdown, Cluster, ProfileCard)

_TRIBES = ["AI-skeptic engineers", "indie hackers", "growth marketers", "crypto builders",
           "design-first founders", "data scientists"]

def make_personas(n: int = 100) -> list[PersonaDocument]:
    docs = []
    for i in range(n):
        tribe = _TRIBES[i % len(_TRIBES)]
        tier = 2 if i % 5 else 1                      # ~80% tier-1
        base = dict(
            seed_account_id="demo", enrichment_tier=tier, user_id=f"u{i}",
            handle=f"@user{i}", display_name=f"User {i}", profile_url=f"https://x.com/user{i}",
            profile_image_url="https://img/x.png", account_age_days=100 + i, verified=(i % 7 == 0),
            bio=f"{tribe} · building things · post {i}",
            metrics=Metrics(followers_count=i * 13, following_count=50 + i,
                            tweet_count=i * 5, listed_count=i % 4),
        )
        if tier == 2:
            content = Content(
                sample_posts=[SamplePost(text=f"thoughts on {tribe} #{i}", type="original",
                                         created_at="2026-08-05T00:00:00Z",
                                         metrics=EngagementBreakdown(like=i, reply=1))],
                context_annotations=[ContextAnnotation(domain="Technology", entity=tribe, count=3)],
                avg_engagement=EngagementBreakdown(like=float(i)))
            card = PersonaCard(archetype=tribe, one_liner=f"A {tribe[:-1]}",
                               ranked_interests=[tribe, "startups"], preferred_formats=["threads"],
                               tone_affinity="candid", conversion_levers=["proof"],
                               summary=f"A member of {tribe}.")
            docs.append(PersonaDocument(**base, content=content, persona_card=card))
        else:
            docs.append(PersonaDocument(**base))
    return docs

def make_clusters(personas: list[PersonaDocument]) -> list[Cluster]:
    clusters = []
    for t, tribe in enumerate(_TRIBES):
        members = [d for d in personas if tribe in d.bio]
        if not members:
            continue
        exemplars = [ProfileCard(user_id=m.user_id, handle=m.handle, display_name=m.display_name,
                                 profile_url=m.profile_url, profile_image_url=m.profile_image_url,
                                 bio=m.bio, verified=m.verified,
                                 followers_count=m.metrics.followers_count) for m in members[:5]]
        clusters.append(Cluster(
            seed_account_id="demo", cluster_id=f"c-{t}", label=tribe,
            persona_card=next((m.persona_card for m in members if m.persona_card), None),
            size=len(members), share_of_audience=len(members) / max(1, len(personas)),
            engagement_index=0.5, exemplars=exemplars, member_ids=[m.user_id for m in members]))
    return clusters

def _write():
    out = pathlib.Path(__file__).parent
    docs = make_personas(100)
    (out / "personas.json").write_text(json.dumps([d.model_dump() for d in docs], indent=2))
    (out / "clusters.json").write_text(json.dumps([c.model_dump() for c in make_clusters(docs)], indent=2))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--write", action="store_true")
    if ap.parse_args().write:
        _write()
```

- [ ] **Step 4: Implement `scripts/precompute.py` + frontend stub**

```python
# backend/scripts/precompute.py
"""Pre-ingest demo accounts before demo day. Usage: uv run python scripts/precompute.py @handle"""
import sys
from app.store import db, jobs
from app.models.job import IngestRequest
from app.ingest.x_client import XClient
from app.ingest.tweepy_adapter import make_api, make_grok
from app import worker

def main(seed: str):
    db.init_db()
    with db.SessionLocal() as s:
        job = jobs.create_job(s, IngestRequest(seed=seed)); s.commit()
        worker.run_job(s, jobs.get_job(s, job.job_id), XClient(api=make_api()), grok_client=make_grok())
        print("done:", job.job_id)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "@xai")
```

```json
// frontend/package.json
{
  "name": "agentsim-frontend",
  "private": true,
  "scripts": { "dev": "vite", "build": "vite build" },
  "devDependencies": { "vite": "^5.0.0" }
}
```

```markdown
<!-- frontend/README.md -->
# AgentSim Frontend (stub)
Teammate D owns this. Backend serves `/clusters`, `/personas`, `/ingest`, `/budget` at http://localhost:8000.
Run backend: `cd backend && docker-compose up -d db && uv run uvicorn app.main:app --reload`
```

- [ ] **Step 5: Generate fixtures + run tests**

Run: `cd backend && uv run python -m app.fixtures.generate --write && uv run pytest tests/test_fixtures.py -v`
Expected: PASS; `app/fixtures/clusters.json` + `personas.json` created.

- [ ] **Step 6: Full suite green**

Run: `cd backend && uv run pytest -v`
Expected: all tasks' tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/fixtures backend/scripts frontend tests/test_fixtures.py && git commit -m "feat(ingest): synthetic fixtures generator, precompute script, frontend stub"
```

---

## Self-Review

**Spec coverage:**
- §2 constraints (pricing, dedup, budget, grok-4.3, B-owned embedding) → Tasks 1,3,5,8,9 + Global Constraints. ✓
- §4.2 PersonaDocument (tiers, seed_engagement, post entities, nullable embedding) → Task 2. ✓
- §4.4/4.5 ProfileCard + Cluster → Task 2 (models) + Task 13 (fixtures). ✓
- §4.6 jobs + cost_ledger → Tasks 4, 5, 11. ✓
- §5 two-tier + stratified + co-engagement → Tasks 8 (engagers), 10 (sampler), 11 (worker phases). ✓
- §6 worker loop, phases, idempotency, budget pause → Tasks 11, 12. ✓
- §7 API surface → Task 12. ✓
- §8 config → Task 1. ✓
- §9 fixtures + team sync → Task 13. ✓
- §10 error handling (fallback, budget pause, per-member failure) → Tasks 9, 11. ✓
- §12 co-engagement core (seed_engagement) → Tasks 8, 11. ✓

**Placeholder scan:** No "TODO/TBD"; the one deferred detail (real tweepy adapter response-mapping) is explicitly scoped in Task 12 Step 4 with concrete method contracts and its own test. Acceptable.

**Type consistency:** `PersonaDocument`, `Content`, `SeedEngagement`, `PersonaCard`, `ProfileCard`, `Cluster`, `IngestJob`, `XClient`, `run_job`, `enrich_tier1/2`, `select_tier2`, `generate_card`, `record_cost/guard/spent` names are used identically across producing and consuming tasks. ✓

**Deferred to B (not in this plan, by design):** embedding computation, `embed_input` composition, vector population, HNSW index creation (B fixes dim first), clustering.
