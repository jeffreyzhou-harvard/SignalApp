# AgentSim — Data Ingestion Layer (Layer A) Design

Spec · xAI Grokathon · 2026-08-08 · Owner: Sam (Layer A — Ingestion)

## 1. Purpose & scope

Layer A owns the **full ingestion pipeline** for AgentSim: pull an account's X
audience, enrich each follower into a rich `PersonaDocument`, generate a Grok
persona card, embed it, and persist it for the ML layer (B) to cluster.

**In scope (this layer):** X API auth + fetch, stratified sampling, raw caching,
cleaning, Grok summarization, embedding, Postgres/pgvector persistence, cost
metering, fixtures, and a FastAPI surface the rest of the team builds against.

**Out of scope (other layers):** clustering/UMAP/HDBSCAN (B), agent/copilot &
Grok Imagine (C), UI (D). We expose a stubbed `/clusters` endpoint returning
fixtures so C/D are unblocked from minute one.

**Seed-agnostic:** the pipeline takes _any_ account ID — the founder's own
account or a competitor/adjacent account — enabling the discovery flow with no
code change.

## 2. Load-bearing constraints (from API research, 2026-08-08)

### X API — pay-as-you-go metered credits (budget: $250 total)

| Resource                 | Cost                               | Notes                                                        |
| ------------------------ | ---------------------------------- | ------------------------------------------------------------ |
| Followers/following read | **$0.010 / record** (owned $0.001) | most expensive read; 1000/page; 300 req/15min                |
| User read                | $0.010 / record                    | **returned inline in followers response — no separate call** |
| Post read                | **$0.005 / record** (owned $0.001) | timeline `max_results` 5–100; ~3,200-post history cap        |
| Post create (plain)      | $0.015                             | teammate D's deploy step                                     |
| Post create **with URL** | **$0.200**                         | ⚠️ avoid links in posted content where possible              |

- **24h UTC dedup:** re-reading the same resource within a day is **free**. Caching
  is literal money — every call is cache-checked first.
- **`liked_tweets` returns only the _authenticated user's own_ likes** (private-Likes
  change). Not viable for arbitrary followers → **likes dropped from ingestion.**
  Reposts/replies still arrive via the timeline.
- Spend-cap hit surfaces as HTTP **403 "billing cycle spend cap"** (not a 429);
  `wait_on_rate_limit` does NOT help — must be handled as a hard stop.
- Client: **tweepy 4.17** (`Client`, `Paginator`, `wait_on_rate_limit=True`).
- Write path (posting) requires **OAuth 2.0 user-context (PKCE)** with
  `tweet.write users.read offline.access`. Current `.env` bearer is app-only (read).

### xAI Grok — summarization

- Model **`grok-4.3`** (1M ctx, $1.25/$2.50 per 1M tok). Old IDs (grok-2/3/4,
  grok-4.1-fast) are **retired and silently redirect + overbill** — never reference them.
- OpenAI-SDK-compatible: `base_url="https://api.x.ai/v1"`, `Authorization: Bearer $XAI_API_KEY`.
- **Structured output:** `response_format={"type":"json_schema", ...}` or the OpenAI
  SDK `.parse()` with a Pydantic model. Note: `additionalProperties` defaults to
  **false** on xAI (opposite of OpenAI habit).
- **No embeddings endpoint** on xAI.
- Est. cost: **~$3 to summarize 1,000 profiles** (~$1.40 with prompt caching on the
  shared system prompt/schema).

### Embeddings

- **OpenAI `text-embedding-3-small`, 1536-dim** (`OPENAI_API_KEY`). ~$0.02 / 1,000 profiles.

### Budget math (target: ingest 2,000–3,000 followers, keep reserve)

```
1,000 followers × $0.010            = $10.00   (follower records)
1,000 × ~10 posts × $0.005          = $50.00   (timelines)
Grok persona cards (1,000)          ≈  $3.00
Embeddings (1,000)                  ≈  $0.02
                                      -------
per 1,000 followers                 ≈ $63/batch  →  ~3,000 followers ≈ $190, leaves reserve
```

## 3. Architecture

```
grokathon/
├── backend/                        # FastAPI app (Layer A)
│   ├── app/
│   │   ├── main.py                 # FastAPI: /ingest /personas /clusters(stub) /budget /health
│   │   ├── config.py               # pydantic-settings, reads .env
│   │   ├── models/
│   │   │   ├── raw.py              # RawUser, RawTweet (verbatim cache)
│   │   │   └── persona.py         # PersonaDocument  ← A→B frozen contract
│   │   ├── ingest/
│   │   │   ├── x_client.py        # tweepy wrapper: followers, timelines, dedup, cost meter
│   │   │   ├── sampler.py         # stratified sampling + hard caps
│   │   │   └── clean.py           # raw → content signature
│   │   ├── enrich/
│   │   │   └── persona_card.py    # Grok grok-4.3 structured summarizer (+ template fallback)
│   │   │                          # (embedding is B's layer — not here)
│   │   ├── worker.py              # async job worker loop (claims jobs, runs phases)
│   │   ├── pipeline.py            # orchestrates fetch→co-engage→sample→clean→card→persist
│   │   ├── store/
│   │   │   ├── db.py              # SQLAlchemy + pgvector engine/session
│   │   │   ├── schema.sql         # tables + nullable vector column (B populates)
│   │   │   └── budget.py          # cost ledger + spend guard (hard stop near cap)
│   │   └── fixtures/              # synthetic PersonaDocuments for B/C/D
│   ├── scripts/precompute.py     # pre-ingest demo accounts before demo day
│   ├── docker-compose.yml        # Postgres + pgvector
│   ├── pyproject.toml
│   └── .env.example
├── frontend/                      # Vite/React stub for teammate D
└── docs/superpowers/specs/
```

**Pipeline stages** (each idempotent + cache-checked):
`fetch followers (tier 1) → co-engagement → stratified sample → fetch timelines →
clean → Grok card → persist`. Embedding is B's downstream step. Every X call routes
through the cost meter, which checks the ledger and hard-stops before the $250 cap.

## 4. Data model

### 4.1 Storage layers

- **Raw cache** (`raw_users`, `raw_tweets`): verbatim API JSON as `JSONB`, keyed by
  ID, written once. Powers 24h-dedup, replay, and cost-avoidance. Never re-fetched
  if present.
- **`personas`**: the derived `PersonaDocument` — structured columns + a **nullable**
  pgvector column **B owns and populates** (dim per B's model; HNSW index once B fixes
  the dim). A writes tier-1/tier-2 rows with `vector = null`.
- **`cost_ledger`**: one row per billable API call (resource, count, unit_cost,
  total, timestamp, dedup_hit) → drives `/budget` and the spend guard.

### 4.2 `PersonaDocument` (frozen A→B contract, schema_version 1.0)

```jsonc
{
  "schema_version": "1.0",
  "seed_account_id": "…", // whose audience this belongs to (founder OR discovery seed)
  "relationship": "follower", // follower | following | seed_topic
  "enrichment_tier": 2, // 1 = bio-only (cheap, ~80% of audience) · 2 = deep (sampled)

  // ── Identity (ALWAYS present — tier 1 + 2) ──
  "user_id": "…",
  "handle": "@…",
  "display_name": "…",
  "profile_url": "https://x.com/…", // direct link to the X profile
  "account_age_days": 3120,
  "verified": true,
  "verified_type": "blue",
  "location": "SF",
  "url": "…",
  "profile_image_url": "…",

  // ── Bio (ALWAYS present) — raw text ──
  "bio": "…",

  // ── Metrics (ALWAYS present) — raw counts, stored for ranking, NOT embedded ──
  "metrics": {
    "followers_count": 0,
    "following_count": 0,
    "tweet_count": 0,
    "listed_count": 0,
  },

  // ── Seed engagement (NULLABLE) — how this user engages with the seed account.
  //     Populated from the co-engagement fetch; drives "most-engaged" ranking + stratification. ──
  "seed_engagement": {
    "likes_on_seed_posts": 0,
    "replies": 0,
    "reposts": 0,
    "last_engaged_at": "ISO-8601 | null",
  },

  // ── Content signature (NULLABLE — tier 2 only; null for tier 1) ──
  "content": {
    "sample_posts": [
      {
        "text": "…",
        "type": "original|reply|repost|quote",
        "created_at": "…",
        "mentions": [{ "id": "…", "handle": "@…" }], // from entities.mentions — anchor signal
        "hashtags": ["…"], // from entities.hashtags
        "referenced_user": { "id": "…", "handle": "@…" }, // WHO was replied-to/reposted/quoted (null if original)
        "metrics": { "like": 0, "reply": 0, "repost": 0, "bookmark": 0 },
      },
    ],
    "context_annotations": [
      {
        "domain": "Technology",
        "entity": "Artificial Intelligence",
        "count": 8,
      },
    ], // freq-weighted
    "avg_engagement": { "like": 0, "reply": 0, "repost": 0, "bookmark": 0 },
  },

  // ── LLM persona card (NULLABLE — tier 2 only). Grok grok-4.3, strict JSON schema. A owns this. ──
  "persona_card": {
    "archetype": "AI-skeptic senior engineer",
    "one_liner": "…",
    "ranked_interests": ["…"],
    "preferred_formats": ["threads", "technical breakdowns"],
    "tone_affinity": "dry, technical, anti-hype",
    "conversion_levers": ["benchmarks", "open-source proof"],
    "summary": "3–4 sentence prose persona…",
  },

  // ── Embedding (NULLABLE) — B owns the vector: composition, model, re-embedding.
  //     A emits this as null; B populates it. `embedding_version` lets B A/B compositions. ──
  "embedding": {
    "embedding_version": "v1", // B-owned; identifies embed_input recipe + model
    "model": "…", // B's choice (local bge/gte or hosted)
    "dim": 0,
    "embed_input": "<exact text embedded>", // B composes; reproducible
    "vector": [/* floats */],
  },
}
```

### 4.3 What we embed (`embed_input`) — **B owns this**

The vector is B's experimental knob, so B owns `embed_input` composition, model
choice, and re-embedding; A emits `embedding: null`. A's job is to make sure every
input B might want is _present in the document_ — which is why §4.2 keeps raw
`sample_posts` text, `mentions`/`hashtags`, and `context_annotations` rather than
only LLM-generated fields.

Composition note (B's call, recorded here): embedding _only_ LLM text
(`summary` + `ranked_interests` + `context_annotations` + `bio`) risks
homogenizing the space — persona cards share the model's register, which blurs
clusters. Raw `sample_posts` text carries the natural variance (voice, vocabulary,
real topics). Recommended starting recipe: **`bio` + 5–8 raw post texts +
`summary` + `ranked_interests` + `context_annotations`**, iterated behind
`embedding_version`. Model of record: **local `bge`/`gte` via sentence-transformers**
(free, offline-safe for demo day, re-embed 10k docs in minutes) — B may swap to a
hosted model if it tunes better. Metrics/engagement stay **stored but not embedded**.

### 4.4 `ProfileCard` (compact, reusable X profile snippet)

A small projection of a `PersonaDocument` used wherever we surface a real person
in the UI (cluster exemplars, focus-group members) without shipping the full
document or forcing a second lookup:

```jsonc
{
  "user_id": "…",
  "handle": "@…",
  "display_name": "…",
  "profile_url": "https://x.com/…",
  "profile_image_url": "…",
  "bio": "…",
  "verified": true,
  "followers_count": 0,
  "top_sample_post": {
    "text": "…",
    "type": "original",
    "metrics": { "like": 0, "repost": 0 },
  },
}
```

### 4.5 `Cluster` (B→C,D contract — A serves the stub + fixtures)

B owns real cluster generation; A serves a **stubbed `/clusters`** returning
fixtures of this exact shape so C/D build from minute one. Every cluster is
**backed by real X profiles** (the vision's "tribes backed by real members"):

```jsonc
{
  "schema_version": "1.0",
  "seed_account_id": "…",
  "cluster_id": "c-ai-skeptics",
  "label": "AI-skeptic senior engineers", // Grok-generated
  "persona_card": {/* representative persona_card for the tribe */},
  "size": 214, // members in this cluster
  "share_of_audience": 0.18, // fraction of sampled audience
  "engagement_index": 0.72, // avg engagement, for "biggest/most-engaged" ranking
  "centroid": [/* floats, B's embedding dim */],
  "exemplars": [/* ProfileCard[] — the real faces of the tribe, for the UI */],
  "member_ids": ["…"], // full membership (join back to personas)
}
```

`exemplars` carry full `ProfileCard`s (real handle, avatar, bio, profile link,
sample post) so the audience map / variant grid can render actual followers, not
placeholders. `member_ids` stays as the cheap full-membership list.

### 4.6 `jobs` & `cost_ledger` (operational tables)

`jobs` — one row per ingestion request; Postgres is the single source of truth for
job state (survives restarts; drives `/ingest/{id}` progress):

```jsonc
{
  "job_id": "uuid", // PK
  "seed": "@somefounder", // handle or id as given
  "seed_account_id": "44196397", // resolved once
  "relationship": "follower", // "follower" | "following"
  "params": { "sample_pct": 0.2, "max_followers": 1000, "posts_per_user": 10 },
  "status": "queued", // queued | running | done | failed | paused_budget
  "phase": "enrich", // resolve | fetch_followers | co_engage | sample | enrich | done
  "progress": { "discovered": 0, "sampled": 0, "enriched": 0, "failed": 0 },
  "member_ids": ["…"], // sampled set (stable across restarts)
  "next_token": "…", // checkpoint for resumable follower pagination
  "cost_usd": 0.0, // running spend for this job
  "budget_cap_usd": 200, // soft-limit snapshot at start
  "error": null,
  "created_at": "…",
  "updated_at": "…",
}
```

`cost_ledger` — one row per billable API call; drives `/budget` and the spend guard:

```jsonc
{
  "id": "uuid",
  "job_id": "uuid | null",
  "provider": "x", // "x" | "xai" | "openai"
  "resource": "followers", // followers | user | post | grok_card | embedding | post_create
  "count": 100, // records/units in the call
  "unit_cost_usd": 0.01,
  "total_usd": 1.0,
  "dedup_hit": false, // true = served from 24h cache, $0
  "created_at": "…",
}
```

## 5. Two-tier enrichment & sampling

Every discovered follower becomes a **tier-1** `PersonaDocument` for free — bio,
identity, and metrics arrive inline in the followers response (no extra call). A
budget-capped **sample is promoted to tier 2** with deep enrichment.

- **Tier 1 (all followers):** identity + bio + metrics; `content` / `persona_card` /
  `embedding` null. B assigns these to clusters by bio-embedding → nearest centroid
  (keys off `enrichment_tier == 1`).
- **Tier 2 (sample):** ~20% of followers, min 100, budget-capped. **Stratified** by
  engagement-with-seed first (see co-engagement), then recent-active + high-metric +
  verified; skip protected/empty accounts. Adds `content` (fetch `posts_per_user`
  posts, default 10, 20 if budget allows) + `persona_card`.
- **Seed co-engagement (core, cheap):** fetch `liking_users` + `retweeted_by` for the
  seed's ~~25 recent posts (~~$50, bounded) → populates `seed_engagement` on matching
  followers **and** drives tier-2 stratification. Distinct from the stretch
  community-detection graph (§12).
- Post typing: distinguish original/reply/repost/quote via `referenced_tweets[].type`;
  capture `referenced_user` + `entities` (mentions/hashtags) per post — irreversible
  if dropped at ingest.

## 6. Job lifecycle & ingestion worker

Ingestion is minutes-long and paid, so it runs as an async job, never inside the
request. **Infra = a `jobs` table (durable state) + one in-process asyncio worker
loop.** No Celery/Redis/broker.

**Worker loop** (started at FastAPI startup):

- Claims the oldest `queued` job, or resumes a `running` job left over from a crash.
- Runs one job at a time (serialized → clean budget accounting, no rate-limit thrash).
- Enriches members with bounded concurrency (semaphore ~5–8 in flight); tweepy's
  sync calls run via `run_in_executor`.
- Checkpoints `progress`/`next_token` to the job row continuously.

**Phases (each idempotent + cache-checked):**

1. `resolve` — seed handle → id (1 cached lookup)
2. `fetch_followers` — paginated; each `raw_user` cached; `next_token` checkpointed →
   resumable mid-fetch. Each follower is written as a **tier-1** persona
   (identity + bio + metrics) immediately.
3. `co_engage` — fetch `liking_users` / `retweeted_by` for the seed's recent posts →
   populate `seed_engagement` on matching followers
4. `sample` — stratified pick (engagement-first); `member_ids` persisted (stable set)
5. `enrich` — per tier-2 member: timeline (cached) → clean → Grok card → **upsert**
   to tier 2; skips anyone already at tier 2. **Embedding is B's step, not the worker's.**
6. `done`

**Why it's robust without a queue:** the pipeline is a pure function of cached
inputs, so re-running is cheap (24h dedup = free) and convergent. A crash mid-job →
the worker re-claims it on restart and continues; fetched data is free, enriched
personas are skipped. Crash-safety by construction, not by a broker.

**Budget guard:** every paid call passes the cost meter, which writes `cost_ledger`
and checks `spent + est_call_cost ≤ soft_limit`. On breach → job set to
`paused_budget` and stopped cleanly (resumable when the cap is raised). Per-member
failures never kill a job (persist `persona_card=null`, bump `failed`, continue).

**Idempotency:** `POST /ingest` for a `(seed_account_id, relationship)` that already
has a `done` job returns that job unless `force: true` — demo re-runs are instant
and free.

## 7. API surface (FastAPI)

| Endpoint           | Method | Purpose                                                                                                                                 |
| ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/ingest`          | POST   | body `{seed, relationship?, sample_pct?, max_followers?, posts_per_user?, force?}` → creates a `queued` job, returns `{job_id, status}` |
| `/ingest/{job_id}` | GET    | job status + phase + progress + running cost                                                                                            |
| `/ingest`          | GET    | list recent jobs                                                                                                                        |
| `/personas`        | GET    | list/query persisted `PersonaDocument`s (paginated)                                                                                     |
| `/clusters`        | GET    | **stub** returning fixture clusters so C/D are unblocked                                                                                |
| `/budget`          | GET    | spend to date, remaining, per-resource breakdown                                                                                        |
| `/health`          | GET    | liveness + DB + config check                                                                                                            |

## 8. Config (`.env`)

```
# X platform (read; already present)
X_AI_CONSUMER_KEY=…
X_AI_SECRET_KEY=…
X_AI_BEARER_TOKEN=…
# X user-context (write path — regenerate before demo day)
X_OAUTH_CLIENT_ID=…            # for OAuth2 PKCE posting (later)
X_OAUTH_CLIENT_SECRET=…
# Grok summarization (A)
XAI_API_KEY=…
# Embeddings are B's layer (local bge/gte or hosted) — not required by A's backend
# Storage
DATABASE_URL=postgresql+psycopg://agentsim:agentsim@localhost:5432/agentsim
# Budget guard
X_API_BUDGET_USD=250
X_API_SPEND_SOFT_LIMIT_USD=200
```

## 9. Fixtures & team sync

- Generate **~100 synthetic `PersonaDocument`s** + a `clusters.json` on day one so B
  (embedding/clustering), C (agent), and D (UI) build against the contract
  immediately. Real data swaps in behind the same schema.
- **Sync point 1 (end of night one):** real data flows A→B once.
- **Sync point 2 (midday day two):** feature freeze; the schema is frozen at v1.0.

## 10. Error handling & resilience

- **Cache-first:** every fetch checks the raw cache before an API call (dedup + cost).
- **Spend guard:** cost meter hard-stops the pipeline at the soft limit ($200) with a
  clear error; 403 spend-cap responses caught distinctly from 429s.
- **Grok fallback:** `persona_card.py` sits behind an interface with a deterministic
  template-based fallback, so the pipeline runs end-to-end even if Grok is down.
- **Rate limits:** tweepy `wait_on_rate_limit=True` + backoff; batch within 24h UTC
  to exploit dedup.
- **Partial failures:** a follower that fails enrichment is persisted with
  `persona_card=null` and retried later, never blocking the batch.

## 11. Testing

- Unit: cleaning (raw → content signature), sampler stratification, cost math,
  `embed_input` construction, budget guard trip.
- Contract: `PersonaDocument` validates against schema v1.0; fixtures conform.
- Integration (mocked X + Grok + OpenAI): full pipeline on fixtures, no live spend.
- One guarded live smoke test against a small known account, off by default.

## 12. Graph strategy (decided)

- **P0 clustering is text-only.** `PersonaDocument` has no follows block; topical
  signal comes free from `context_annotations` + bio + sample posts + persona card.
- **Per-follower following-list fetch is cut** — billed per followed account
  ($0.010/record → ~$3–5 per follower → thousands for a 1k audience). The anchor
  compression trick (rank shared anchors, enrich the top ~300, LLM-tag them) is
  elegant but sits downstream of that unaffordable fetch, so it's out for the weekend.
- **Seed co-engagement fetch is now CORE** (promoted from stretch): fetch
  `liking_users` + `retweeted_by` for the seed's ~~25 recent posts (~~$50, bounded,
  per-post not pairwise). It populates `seed_engagement` on `PersonaDocument`s and
  drives tier-2 stratification + the copilot's "most-engaged" command. Also retained
  as a `followers × seed-posts` matrix.
- **Graph _uses_ of that matrix stay stretch:** Leiden/Louvain community detection
  cross-validated against embedding clusters (the SimClusters judge line), Graph RAG
  grounding for focus-group + bridge queries, and galaxy-viz edges. None touch the
  clustering pipeline.
- **Skip entirely:** node2vec, blended affinity matrices, per-follower follow-list fetch.

## 13. Open questions / assumptions

1. **Write path deferred:** posting (OAuth2 PKCE, Read+Write token) is teammate D's
   deploy step; A provides the audience export + a posting helper but the token must
   be regenerated before demo day. Assumed not needed for the ingestion demo.
2. **Demo account** not yet chosen — needs enough followers to cluster interestingly.
   `scripts/precompute.py` will pre-ingest it before demo day to avoid live spend.
3. **Cluster ranking** ("my biggest following") is B/C's call (size vs
   engagement-weighted) — A just supplies metrics + engagement in the persona doc.
4. **Sample depth** assumed 20% / min 100 / 10 posts each — tunable via `/ingest`
   params and budget guard.
5. **pgvector index** assumed HNSW; revisit if row counts stay small (flat scan fine).

## 14. Implementation status (as built, 2026-08-08)

**Shipped and verified end-to-end.** All 13 plan tasks implemented (35 tests passing).

- **Schema single source of truth:** the SQLAlchemy ORM in `backend/app/store/db.py`
  is the only schema definition — the reference `schema.sql` was removed to prevent
  drift. Apply only via the idempotent CLI (`scripts/init_db.py` / `python -m
  app.store.db`) or the FastAPI startup hook; never hand-run DDL.
- **Shared DB:** `DATABASE_URL` points at a Neon Postgres (pgvector) so A ingests
  once and B/C/D read the same data. Tests are pinned to local Postgres via
  `tests/conftest.py`.
- **Grok key alias:** config accepts either `X_AI_API_KEY` (actual .env convention)
  or `XAI_API_KEY`.
- **Live run** (`@SChen1249`, app-only bearer): resolved seed → 10 followers (tier-1)
  → 8 deep-enriched (tier-2 + Grok persona cards) → persisted to Neon; **$0.61**
  real spend. `curl POST /ingest` is the acceptance path.
- **Co-engagement limitation:** `liking_users`/`retweeters` require OAuth
  user-context; on an app-only bearer the `co_engage` phase **degrades gracefully**
  (leaves `seed_engagement = null`) rather than failing the job. Wiring OAuth
  user-context is the follow-up to populate `seed_engagement`.
- **Known gap:** `job.cost_usd` is not synced from the ledger; `/budget` is the
  accurate spend source.
