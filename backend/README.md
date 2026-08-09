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
  it needs a **public HTTPS URL**. Two ways:

  **Stable (recommended — set Vercel once, never touch again):** a Cloudflare
  *named* tunnel gives a permanent hostname that survives restarts.
  ```bash
  # one-time: add a domain to Cloudflare, then auth
  cloudflared tunnel login
  # one command wires the tunnel + DNS + config + MCP_ALLOWED_HOSTS:
  ./scripts/setup-named-tunnel.sh mcp.yourdomain.com
  # then run the server + tunnel (the script prints these):
  uv run uvicorn app.main:app --port 8000
  cloudflared tunnel run agentsim-mcp        # or: sudo cloudflared service install (always-on)
  ```
  Set on Vercel once: `AUDIENCE_MCP_URL=https://mcp.yourdomain.com/mcp`. Because the
  URL never rotates, Vercel stays valid forever.

  **Quick + throwaway (demo only):** `cloudflared tunnel --url http://localhost:8000`
  prints a random `*.trycloudflare.com` URL. Set `AUDIENCE_MCP_URL`/`MCP_ALLOWED_HOSTS`
  to it — but it rotates on every restart, so you must update both each time.

  Either way, `MCP_ALLOWED_HOSTS` must include the public host (localhost is always
  trusted) or requests 421 from the DNS-rebinding check.

### Deploy to Render (free, no card, stable URL)

Gives a permanent `https://<name>.onrender.com/mcp` URL — set it on Vercel once.
Uses `render.yaml` (repo root) + the host-agnostic `Dockerfile` (honors `$PORT`).

1. render.com → sign up (**no credit card**) → **New → Blueprint** → pick this repo
   (grant the Render GitHub App access to the private repo when prompted).
2. It reads `render.yaml` and creates the `agentsim-mcp` web service (free plan, Docker).
3. Set the two secret env vars in the Render dashboard: `DATABASE_URL` (Neon),
   `GEMINI_API_KEY`. (`RUN_WORKER=false` and `MCP_ALLOWED_HOSTS` are already in
   `render.yaml` — update `MCP_ALLOWED_HOSTS` if your service name isn't `agentsim-mcp`.)
4. On Vercel (once): `AUDIENCE_MCP_URL=https://<name>.onrender.com/mcp`.

Free services **spin down after ~15 min idle** (~1 min cold start). Keep it warm so
xAI's tool calls don't time out — ping `/health` every ~10 min (a free
[cron-job.org](https://cron-job.org) job or a scheduled GitHub Action).

> Same `Dockerfile` runs on Fly / Cloud Run / HF Spaces too — but those now need a
> card (Fly, Cloud Run) or a PRO plan (HF Docker Spaces). Render is the no-cost path.

### Stable URL without hosting — Cloudflare named tunnel

If you'd rather keep the server on your own machine but still have a permanent URL,
`scripts/setup-named-tunnel.sh` wires a Cloudflare *named* tunnel (needs a domain
on Cloudflare). See the Grok-agent section above.
