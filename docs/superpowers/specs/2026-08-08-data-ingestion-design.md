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

**Seed-agnostic:** the pipeline takes *any* account ID — the founder's own
account or a competitor/adjacent account — enabling the discovery flow with no
code change.

## 2. Load-bearing constraints (from API research, 2026-08-08)

### X API — pay-as-you-go metered credits (budget: $250 total)

| Resource | Cost | Notes |
| --- | --- | --- |
| Followers/following read | **$0.010 / record** (owned $0.001) | most expensive read; 1000/page; 300 req/15min |
| User read | $0.010 / record | **returned inline in followers response — no separate call** |
| Post read | **$0.005 / record** (owned $0.001) | timeline `max_results` 5–100; ~3,200-post history cap |
| Post create (plain) | $0.015 | teammate D's deploy step |
| Post create **with URL** | **$0.200** | ⚠️ avoid links in posted content where possible |

- **24h UTC dedup:** re-reading the same resource within a day is **free**. Caching
  is literal money — every call is cache-checked first.
- **`liked_tweets` returns only the *authenticated user's own* likes** (private-Likes
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
│   │   │   ├── persona_card.py    # Grok grok-4.3 structured summarizer (+ template fallback)
│   │   │   └── embed.py           # OpenAI text-embedding-3-small
│   │   ├── pipeline.py            # orchestrates fetch→sample→clean→card→embed→persist
│   │   ├── store/
│   │   │   ├── db.py              # SQLAlchemy + pgvector engine/session
│   │   │   ├── schema.sql         # tables + vector index
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
`fetch followers → stratified sample → fetch timelines → clean → Grok card → embed → persist`.
Every X call routes through the cost meter, which checks the ledger and hard-stops
before the $250 cap.

## 4. Data model

### 4.1 Storage layers

- **Raw cache** (`raw_users`, `raw_tweets`): verbatim API JSON as `JSONB`, keyed by
  ID, written once. Powers 24h-dedup, replay, and cost-avoidance. Never re-fetched
  if present.
- **`personas`**: the derived `PersonaDocument` — structured columns + a
  `vector(1536)` pgvector column (HNSW index) so B gets similarity search for free.
- **`cost_ledger`**: one row per billable API call (resource, count, unit_cost,
  total, timestamp, dedup_hit) → drives `/budget` and the spend guard.

### 4.2 `PersonaDocument` (frozen A→B contract, schema_version 1.0)

```jsonc
{
  "schema_version": "1.0",
  "seed_account_id": "…",          // whose audience this belongs to (founder OR discovery seed)
  "relationship": "follower",      // follower | following | seed_topic

  // ── Identity ──
  "user_id": "…", "handle": "@…", "display_name": "…",
  "account_age_days": 3120, "verified": true, "verified_type": "blue",
  "location": "SF", "url": "…", "profile_image_url": "…",

  // ── Bio ──
  "bio": "…",
  "bio_entities": { "hashtags": [], "mentions": [], "urls": [] },

  // ── Metrics ──
  "metrics": {
    "followers_count": 0, "following_count": 0, "tweet_count": 0, "listed_count": 0,
    "influence_ratio": 0.0,        // followers / following
    "activity_level": "high"       // derived from tweet_count / account_age
  },

  // ── Content signature (last N posts) ──
  "content": {
    "sample_posts": [ { "text": "…", "type": "original|reply|repost|quote",
                        "created_at": "…", "metrics": {"like":0,"reply":0,"repost":0,"bookmark":0} } ],
    "top_hashtags": [], "top_mentions": [],
    "context_annotations": [ {"domain":"Technology","entity":"Artificial Intelligence"} ], // X's OWN topic tags
    "media_ratio": 0.2, "reply_ratio": 0.3, "original_ratio": 0.6,
    "avg_engagement": {"like":0,"reply":0,"repost":0,"bookmark":0}
  },

  // ── LLM persona card (Grok grok-4.3, strict JSON schema) ──
  "persona_card": {
    "archetype": "AI-skeptic senior engineer",
    "one_liner": "…",
    "ranked_interests": ["…"],
    "preferred_formats": ["threads","technical breakdowns"],
    "tone_affinity": "dry, technical, anti-hype",
    "conversion_levers": ["benchmarks","open-source proof"],
    "summary": "3–4 sentence prose persona…"
  },

  // ── Embedding (Layer A owns this) ──
  "embedding": {
    "model": "text-embedding-3-small", "dim": 1536,
    "embed_input": "<exact text embedded>",     // reproducible
    "vector": [ /* 1536 floats */ ]
  },

  // ── Provenance / cost ──
  "meta": { "fetched_at": "…", "posts_sampled": 10, "api_cost_usd": 0.06 }
}
```

### 4.3 What we embed (`embed_input`)

`embed_input` = **Grok `summary` + `ranked_interests` + `context_annotations` + `bio`**,
concatenated in a canonical, deterministic order. Rationale: the Grok summary
carries semantic richness, `context_annotations` are X's own high-signal topic
labels, and pinning the exact `embed_input` makes embeddings reproducible and cheap
to re-run. Metrics/engagement are **stored but not embedded** — B weights those
numerically or as sparse features rather than diluting the dense vector.

## 5. Sampling strategy

- Sample **~20% of followers**, minimum **100**, capped by budget guard.
- **Stratified** to maximize signal per dollar: prioritize recent-active +
  high-metric + verified accounts first; skip protected/empty accounts.
- Per sampled follower, fetch **last 10 posts** (`max_results=10`), including
  originals/replies/reposts/quotes (distinguish via `referenced_tweets[].type`).

## 6. API surface (FastAPI)

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/ingest` | POST | body `{seed_account, sample_pct, max_followers}` → runs pipeline (async job), returns job id |
| `/ingest/{job_id}` | GET | job status + progress + running cost |
| `/personas` | GET | list/query persisted `PersonaDocument`s (paginated) |
| `/clusters` | GET | **stub** returning fixture clusters so C/D are unblocked |
| `/budget` | GET | spend to date, remaining, per-resource breakdown |
| `/health` | GET | liveness + DB + config check |

## 7. Config (`.env`)

```
# X platform (read; already present)
X_AI_CONSUMER_KEY=…
X_AI_SECRET_KEY=…
X_AI_BEARER_TOKEN=…
# X user-context (write path — regenerate before demo day)
X_OAUTH_CLIENT_ID=…            # for OAuth2 PKCE posting (later)
X_OAUTH_CLIENT_SECRET=…
# Grok summarization
XAI_API_KEY=…
# Embeddings
OPENAI_API_KEY=…
# Storage
DATABASE_URL=postgresql+psycopg://agentsim:agentsim@localhost:5432/agentsim
# Budget guard
X_API_BUDGET_USD=250
X_API_SPEND_SOFT_LIMIT_USD=200
```

## 8. Fixtures & team sync

- Generate **~50 synthetic `PersonaDocument`s** + a `clusters.json` on day one so B
  (embedding/clustering), C (agent), and D (UI) build against the contract
  immediately. Real data swaps in behind the same schema.
- **Sync point 1 (end of night one):** real data flows A→B once.
- **Sync point 2 (midday day two):** feature freeze; the schema is frozen at v1.0.

## 9. Error handling & resilience

- **Cache-first:** every fetch checks the raw cache before an API call (dedup + cost).
- **Spend guard:** cost meter hard-stops the pipeline at the soft limit ($200) with a
  clear error; 403 spend-cap responses caught distinctly from 429s.
- **Grok fallback:** `persona_card.py` sits behind an interface with a deterministic
  template-based fallback, so the pipeline runs end-to-end even if Grok is down.
- **Rate limits:** tweepy `wait_on_rate_limit=True` + backoff; batch within 24h UTC
  to exploit dedup.
- **Partial failures:** a follower that fails enrichment is persisted with
  `persona_card=null` and retried later, never blocking the batch.

## 10. Testing

- Unit: cleaning (raw → content signature), sampler stratification, cost math,
  `embed_input` construction, budget guard trip.
- Contract: `PersonaDocument` validates against schema v1.0; fixtures conform.
- Integration (mocked X + Grok + OpenAI): full pipeline on fixtures, no live spend.
- One guarded live smoke test against a small known account, off by default.

## 11. Open questions / assumptions

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
