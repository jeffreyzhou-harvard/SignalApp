# Backend MCP Retrieval Server — Design

**Date:** 2026-08-08
**Branch:** `feat/mcp-search` (worktree `../grokathon-mcp`)
**Owner:** Layer A (data ingestion)

## Goal

Expose the ingested audience as agent-callable tools over the Model Context
Protocol (MCP), so any MCP-native client (Claude Desktop, Cursor, Claude Code)
can search personas semantically and inspect specific users. Ship the **search
infrastructure now**; it lights up the moment Layer B writes embedding vectors
to the shared DB. Clusters are explicitly out of scope for this iteration.

## Consumer

MCP-native clients (Claude/Cursor) connecting to a remote MCP URL over the
**streamable-HTTP** transport. Not the Next.js Grok chat agent (that speaks
function-calling, not MCP) — though the same retrieval core could back it later.

## Cross-layer contract (agreed with Layer B, `ml/agentsim_ml/embed.py`)

Semantic search embeds the *query* at request time and compares it to B's
*stored* persona vectors with pgvector cosine (`<=>`). This only works if both
sides share one embedding space:

| Knob | Value (B's plan of record) |
| --- | --- |
| Model | `gemini-embedding-001` |
| Dimension | 1536 |
| Normalization | L2 (cosine == dot product) |
| Doc task_type | `CLUSTERING` |
| Auth | `GEMINI_API_KEY` |

**Query task_type** defaults to `CLUSTERING` to match B's document space
(configurable). All values are config-driven so re-aligning with B is a one-line
change, never a code change.

**Open dependency (not a blocker):** B's `ml/` pipeline currently outputs to
`runs/`. Search reads `personas.vector` on the shared Neon DB. Until B writes
vectors back to that column, `search` returns `embeddings_not_ready`. Confirm
the write-back path with B.

## Architecture

A `FastMCP` server mounted into the existing FastAPI app at `/mcp` (one
deployable, one process). It is a thin skin over a new, independently testable
retrieval core.

```
Claude / Cursor ──(MCP / streamable-HTTP)──▶ /mcp
                                              │
                                    app/mcp/server.py      (tool defs, thin)
                                              │
                                    app/retrieval/
                                       ├─ embedder.py      (query text → 1536-d vector)
                                       └─ search.py        (pgvector cosine over personas.vector)
                                              │
                                    app/store/personas.py  (existing store)
```

## Components (one responsibility each — per CLAUDE.md)

### `app/retrieval/embedder.py`
Turns query text into a 1536-d L2-normalized vector.
- `Embedder` protocol: `embed(text: str) -> list[float]`.
- `GeminiEmbedder` — calls `google-genai` `embed_content` with
  `model=gemini-embedding-001`, `output_dimensionality=1536`,
  `task_type=<config>`; L2-normalizes. Mirrors B's call so the spaces match.
  Reads `GEMINI_API_KEY`.
- `FakeEmbedder(vec)` — deterministic fixed vector for tests (no network).
- `get_embedder()` — factory reading config; returns `None` when unconfigured
  (no key) so callers can report `embeddings_not_ready` instead of crashing.

### `app/retrieval/search.py`
The core logic. Pure function of its inputs (DI'd session + embedder).
- `search(session, embedder, query, k=10, seed_account_id=None) -> dict`
- If `embedder is None` or no non-null vectors exist →
  `{"status": "embeddings_not_ready", "results": []}`.
- Else: embed query, run
  `SELECT ... WHERE vector IS NOT NULL [AND seed_account_id=:s]
   ORDER BY vector <=> :qvec LIMIT :k`, map rows to summaries with a
  `score` (1 - cosine distance).
- Result item: `{handle, name, one_liner, ranked_interests, score, user_id}`.

### `app/mcp/server.py`
`FastMCP` instance + two tools, each ~10 lines calling the core:
- `search(query: str, k: int = 10, seed_account_id: str | None = None)` —
  semantic persona search. Returns ranked summaries or `embeddings_not_ready`.
- `get_persona(handle_or_id: str)` — full persona (card + bio + metrics) for one
  user. Works today, no embeddings needed. Returns `{status: "not_found"}` when
  absent.
Tool docstrings are the agent-facing contract — written for an LLM caller.

### `app/main.py` (modify)
Mount the MCP app at `/mcp` and wire its session-manager lifespan into the app
lifespan (FastMCP streamable-HTTP requires its lifespan to run).

### `app/config.py` (modify)
Add, all env-overridable:
- `embedding_model: str = "gemini-embedding-001"`
- `embedding_dim: int = 1536`
- `embedding_task_type: str = "CLUSTERING"`
- `gemini_api_key: str = ""` (alias `GEMINI_API_KEY`)

### `pyproject.toml` (modify)
Add deps: `mcp` (official SDK, includes FastMCP + streamable-HTTP) and
`google-genai` (query embeddings).

## Data flow (search)

1. Client calls `search("people into robotics", k=5)` over MCP.
2. `server.py` → `search.py`.
3. `embedder.embed(query)` → 1536-d vector (Gemini) — or `None` → not-ready.
4. pgvector cosine ORDER BY over `personas.vector`.
5. Rows → ranked summaries → returned to the agent as structured content.

## Error handling / degradation
- No `GEMINI_API_KEY` or no stored vectors → `embeddings_not_ready` (never a 500).
- Gemini call fails → surfaced as a tool error with a readable message; the
  tool call fails cleanly, the server stays up.
- `get_persona` miss → `{status: "not_found"}`.

## Testing
- `tests/test_search.py` — seed 3 personas with hand-set small-dim vectors +
  `FakeEmbedder`; assert cosine ranking order; assert `embeddings_not_ready`
  when the column is all-null.
- `tests/test_mcp.py` — smoke via the MCP server object: both tools registered;
  `get_persona` returns a seeded user; `search` is callable and returns the
  not-ready shape without a key.
- Tests use the local Postgres pinned in `conftest.py`; no network (FakeEmbedder).

## Out of scope (deliberate)
- **Clusters tool** — held per direction (B's output, contract not yet fixed).
- **Auth on `/mcp`** — left open for the demo; config seam noted for a bearer.
- **Next.js proxy route** — only needed once deployed publicly; local
  Claude/Cursor hit `http://localhost:8000/mcp` directly. One-file follow-up.

## Run / connect
- Server: `uv run uvicorn app.main:app` → MCP at `http://localhost:8000/mcp`.
- Claude Desktop / Cursor: add an MCP server entry pointing at that URL
  (streamable-HTTP). Documented in `backend/README.md` on implementation.
