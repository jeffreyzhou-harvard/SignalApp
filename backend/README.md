# AgentSim — Data Ingestion Backend (Layer A)

FastAPI service that pulls an X account's audience and enriches it into
`PersonaDocument`s for the ML layer (B) to embed and cluster.

Full design: [`docs/superpowers/specs/2026-08-08-data-ingestion-design.md`](../docs/superpowers/specs/2026-08-08-data-ingestion-design.md).

## What it does

Give it an X handle → it resolves the account, fetches followers (tier-1: bio +
metrics for everyone, free/inline), samples a subset for deep enrichment (tier-2:
recent posts + Grok persona card), and persists everything to Postgres/pgvector.
Every X call is **cache-first** (24h dedup = free) and **budget-metered** (hard
stop before the $250 cap). Embedding vectors are **Layer B's** job — A writes
`embedding = null`.

## Setup

```bash
cd backend
uv venv --python 3.12 && uv sync
cp ../.env.example .env        # then fill in X_AI_BEARER_TOKEN, X_AI_API_KEY, DATABASE_URL
```

### Database — single source of truth

The SQLAlchemy ORM in `app/store/db.py` **is** the schema. There is no
hand-maintained SQL file. Apply/refresh it only through the idempotent CLI (never
run DDL manually):

```bash
uv run python scripts/init_db.py      # or: uv run python -m app.store.db
```

- **Local dev:** `docker-compose up -d db` (Postgres+pgvector), then `init_db`.
- **Shared team DB:** point `DATABASE_URL` at Neon
  (`postgresql+psycopg://USER:PASS@HOST/db?sslmode=require`), then `init_db`. Ingest
  once, everyone reads the same data.
- **Tests** always run against local Postgres (pinned in `tests/conftest.py`), never
  the shared DB.

## Run

```bash
uv run uvicorn app.main:app --reload      # starts the API + background ingest worker
```

## Live demo (fully non-stubbed)

```bash
curl -X POST http://127.0.0.1:8000/ingest \
  -H 'Content-Type: application/json' \
  -d '{"seed":"@SChen1249","max_followers":10,"sample_pct":1.0,"posts_per_user":5}'
# → {"job_id":"…","status":"queued"}

curl http://127.0.0.1:8000/ingest/<job_id>      # poll: resolve→fetch→sample→enrich→done
curl http://127.0.0.1:8000/personas?seed_account_id=<id>
curl http://127.0.0.1:8000/budget
```

Verified end-to-end against **@SChen1249**: 10 followers discovered, 8 deep-enriched
with Grok persona cards, persisted to Neon, **$0.61** real spend.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/ingest` | `{seed, relationship?, sample_pct?, max_followers?, posts_per_user?, force?}` → queues a job |
| GET | `/ingest/{job_id}` | job status + phase + progress + cost |
| GET | `/ingest` | recent jobs |
| GET | `/personas?seed_account_id=` | persisted `PersonaDocument`s |
| GET | `/clusters` | **stub** (fixtures) so B/C/D are unblocked |
| GET | `/budget` | spend to date + remaining |
| GET | `/health` | liveness |

## Known limitations (by design)

- **Co-engagement (`seed_engagement`) needs OAuth user-context.** An app-only
  bearer 403s on `liking_users`/`retweeters`, so the `co_engage` phase **degrades
  gracefully** (leaves `seed_engagement = null`) instead of failing the job.
- **`job.cost_usd`** is not wired to the ledger — use `/budget` for accurate spend.
- **Embeddings** are Layer B's (vector column is nullable, B-populated).

## Test

```bash
docker-compose up -d db
uv run pytest -q        # 35 passing
```

## Deploy the MCP server (Fly.io, free)

Gives the MCP server a stable public HTTPS URL so xAI's server-side executor (and
Claude/Cursor) can reach it — no Railway, no tunnel. Run from `backend/`:

```bash
fly auth login                         # one-time, opens browser
fly launch --copy-config --no-deploy   # adopts fly.toml; pick an app name -> <app>
# set secrets (Neon URL, Gemini key, and this app's own host for the allow-list):
fly secrets set \
  DATABASE_URL="postgresql+psycopg://…neon…?sslmode=require" \
  GEMINI_API_KEY="…" \
  MCP_ALLOWED_HOSTS="<app>.fly.dev"
fly deploy
```

Then point the frontend at it — set on Vercel (and `.env.local` for local dev):

```
AUDIENCE_MCP_URL=https://<app>.fly.dev/mcp
```

Notes:
- `RUN_WORKER=false` is baked into `fly.toml` — this is a read-only MCP deploy, so
  it won't run the ingestion worker (ingest still runs locally/elsewhere).
- `MCP_ALLOWED_HOSTS` must include the Fly hostname or requests 421 (DNS-rebinding
  protection stays on; localhost is always trusted).
- `min_machines_running = 1` keeps it warm (no cold start when the agent calls);
  set to 0 in `fly.toml` to scale to zero and save resources.
