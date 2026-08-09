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

## Giving agents access to the MCP server

- **Local MCP clients (Claude Desktop, Cursor, Claude Code):** run the server and
  point the client at `http://localhost:8000/mcp`. The repo `.mcp.json` already
  declares it — no tunnel, no deploy needed.
- **The Grok voice agent (frontend):** xAI executes remote MCP **server-side**, so
  it needs a **public HTTPS URL**. For a demo, expose the local server with a
  cloudflare quick tunnel:
  ```bash
  cloudflared tunnel --url http://localhost:8000   # prints https://<random>.trycloudflare.com
  ```
  Then set `AUDIENCE_MCP_URL=https://<host>/mcp` (frontend `.env.local` / Vercel)
  and `MCP_ALLOWED_HOSTS=<host>` (`backend/.env`) — the latter satisfies the MCP
  DNS-rebinding check (localhost is always trusted). Quick-tunnel URLs rotate on
  restart, so update both when it changes.

### Container deploy (any host)

`Dockerfile` builds a self-contained image (uvicorn on `:8080`) usable on any
container host (Hugging Face Spaces, Render, Cloud Run, Fly, …). Set env/secrets:
`DATABASE_URL` (Neon), `GEMINI_API_KEY`, `MCP_ALLOWED_HOSTS=<public-host>`, and
`RUN_WORKER=false` (read-only MCP deploy — don't run the ingestion worker).
