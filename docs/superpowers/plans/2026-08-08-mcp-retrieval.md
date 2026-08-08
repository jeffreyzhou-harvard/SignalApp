# Backend MCP Retrieval Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the ingested X audience to MCP-native agents (Claude/Cursor) via two tools — semantic `search` over persona embeddings and `get_persona` lookup — mounted into the FastAPI backend at `/mcp`.

**Architecture:** A `FastMCP` server (streamable-HTTP transport) mounted into the existing FastAPI app is a thin skin over a new, independently testable retrieval core (`app/retrieval/`). Query text is embedded with Gemini into Layer B's vector space; pgvector cosine ranks personas. Everything degrades to `embeddings_not_ready` until B populates `personas.vector`.

**Tech Stack:** Python 3.12 (uv), FastAPI, SQLAlchemy 2.0 + pgvector, `mcp` (official SDK, FastMCP), `google-genai` (query embeddings), pytest.

## Global Constraints

- **Shared embedding space (must match Layer B, `ml/agentsim_ml/embed.py`):** model `gemini-embedding-001`, dim `1536`, L2-normalized float32, doc `task_type=CLUSTERING`. All are config-driven — never inline.
- **Config over hardcoding** (CLAUDE.md): model names, dims, keys, task_type come from `app/config.py`, read from env.
- **One responsibility per module** (CLAUDE.md): core logic (`app/retrieval/`) must not import interface code (`app/mcp/`); the MCP layer depends on the core, not vice-versa.
- **Graceful degradation:** missing `GEMINI_API_KEY` or no stored vectors → return `{"status": "embeddings_not_ready", "results": []}`, never raise/500.
- **Tests hit local Postgres** (pinned in `tests/conftest.py`) and make **no network calls** — always use `FakeEmbedder`, never real Gemini.
- **Do not modify the DB schema** — `personas.vector` (dimensionless `Vector()`, nullable) already exists; B owns writing it.
- **Commits:** author is the local git user; **no `Co-Authored-By` trailer**.
- All work is in worktree `../grokathon-mcp` on branch `feat/mcp-search`; run commands from `backend/`.

---

### Task 1: Config + dependencies

**Files:**
- Modify: `backend/app/config.py` (add embedding settings after `enrich_concurrency`)
- Modify: `backend/pyproject.toml` (add `mcp`, `google-genai` to `dependencies`)
- Test: `backend/tests/test_config_embedding.py`

**Interfaces:**
- Produces: `settings.embedding_model: str`, `settings.embedding_dim: int`, `settings.embedding_task_type: str`, `settings.gemini_api_key: str`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_config_embedding.py
from app.config import settings

def test_embedding_defaults_match_layer_b():
    assert settings.embedding_model == "gemini-embedding-001"
    assert settings.embedding_dim == 1536
    assert settings.embedding_task_type == "CLUSTERING"
    # key defaults empty (present only via env) — attribute must exist
    assert isinstance(settings.gemini_api_key, str)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_config_embedding.py -v`
Expected: FAIL — `AttributeError: 'Settings' object has no attribute 'embedding_model'`

- [ ] **Step 3: Add the settings**

In `backend/app/config.py`, immediately before the closing `settings = Settings()` line, inside the `Settings` class (after the `enrich_concurrency` field):

```python
    # Embedding space — MUST match Layer B (ml/agentsim_ml/embed.py) so query and
    # stored persona vectors live in one space. Config-driven; never inline.
    embedding_model: str = "gemini-embedding-001"
    embedding_dim: int = 1536
    embedding_task_type: str = "CLUSTERING"   # match B's document embeddings
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
```

`Field` and `AliasChoices` are already imported at the top of the file — verify `Field` is imported; it is.

- [ ] **Step 4: Add dependencies**

In `backend/pyproject.toml`, add to the `dependencies` list:

```toml
  "mcp>=1.2",
  "google-genai>=0.8",
```

Then install:

Run: `uv sync`
Expected: resolves and installs `mcp` and `google-genai`.

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_config_embedding.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/config.py backend/pyproject.toml backend/uv.lock backend/tests/test_config_embedding.py
git commit -m "config(mcp): embedding-space settings (Gemini 1536) + mcp/google-genai deps"
```

---

### Task 2: Query embedder

**Files:**
- Create: `backend/app/retrieval/__init__.py` (empty)
- Create: `backend/app/retrieval/embedder.py`
- Test: `backend/tests/test_embedder.py`

**Interfaces:**
- Consumes: `settings.embedding_model`, `settings.embedding_dim`, `settings.embedding_task_type`, `settings.gemini_api_key`.
- Produces:
  - `class FakeEmbedder: def __init__(self, vec: list[float]); name: str; def embed(self, text: str) -> list[float]`
  - `class GeminiEmbedder: name: str; def embed(self, text: str) -> list[float]`
  - `def get_embedder() -> Embedder | None` — returns `None` when `gemini_api_key` is empty.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_embedder.py
import math
from app.retrieval import embedder as emb

def test_fake_embedder_returns_fixed_vector():
    e = emb.FakeEmbedder([1.0, 0.0, 0.0])
    assert e.embed("anything") == [1.0, 0.0, 0.0]
    assert e.name == "fake"

def test_get_embedder_none_without_key(monkeypatch):
    monkeypatch.setattr(emb.settings, "gemini_api_key", "")
    assert emb.get_embedder() is None

def test_get_embedder_returns_gemini_with_key(monkeypatch):
    monkeypatch.setattr(emb.settings, "gemini_api_key", "test-key")
    e = emb.get_embedder()
    assert isinstance(e, emb.GeminiEmbedder)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_embedder.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.retrieval'`

- [ ] **Step 3: Create the module**

`backend/app/retrieval/__init__.py`: empty file.

`backend/app/retrieval/embedder.py`:

```python
"""Query embedder — turns query text into a vector in Layer B's space.

The vector MUST match B's stored persona vectors (same model, dim, normalization,
task_type) or cosine comparison is meaningless. All knobs come from config.
`get_embedder()` returns None when unconfigured so callers report
`embeddings_not_ready` instead of crashing. Tests use FakeEmbedder — never network.
"""
from __future__ import annotations

import math
from typing import Protocol

from app.config import settings


class Embedder(Protocol):
    name: str

    def embed(self, text: str) -> list[float]: ...


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


class FakeEmbedder:
    """Deterministic, offline. For tests only."""

    name = "fake"

    def __init__(self, vec: list[float]):
        self._vec = list(vec)

    def embed(self, text: str) -> list[float]:
        return list(self._vec)


class GeminiEmbedder:
    """gemini-embedding-001, matching Layer B. Imports google-genai lazily so the
    module (and the whole app) loads without the extra installed / key present."""

    name = "gemini-embedding-001"

    def embed(self, text: str) -> list[float]:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)
        resp = client.models.embed_content(
            model=settings.embedding_model,
            contents=[text],
            config=types.EmbedContentConfig(
                task_type=settings.embedding_task_type,
                output_dimensionality=settings.embedding_dim,
            ),
        )
        return _l2_normalize(list(resp.embeddings[0].values))


def get_embedder() -> Embedder | None:
    if not settings.gemini_api_key:
        return None
    return GeminiEmbedder()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_embedder.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/retrieval/__init__.py backend/app/retrieval/embedder.py backend/tests/test_embedder.py
git commit -m "feat(mcp): query embedder (Gemini + Fake), config-driven, offline-safe"
```

---

### Task 3: Persona lookup by handle-or-id

**Files:**
- Modify: `backend/app/store/personas.py` (add `find_persona`)
- Test: `backend/tests/test_persona_lookup.py`

**Interfaces:**
- Consumes: `db.PersonaRow`, `PersonaDocument`, existing `get_persona(session, user_id)`.
- Produces: `def find_persona(session, handle_or_id: str) -> PersonaDocument | None` — resolves a numeric id via primary key, otherwise matches `doc->>'handle'` case-insensitively with or without a leading `@`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_persona_lookup.py
import pytest
from app.store import db, personas
from app.models.persona import PersonaDocument

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.commit()
    yield
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.commit()

def _doc(uid="900001", handle="@Ada"):
    return PersonaDocument(
        seed_account_id="seed", relationship="follower", enrichment_tier=1,
        user_id=uid, handle=handle, display_name="Ada", profile_url="https://x.com/ada",
        profile_image_url="http://img", account_age_days=1, verified=False, bio="hi",
        metrics={"followers_count": 1, "following_count": 1, "tweet_count": 1, "listed_count": 0},
    )

def test_find_by_user_id():
    with db.SessionLocal() as s:
        personas.upsert_persona(s, _doc()); s.commit()
        assert personas.find_persona(s, "900001").handle == "@Ada"

def test_find_by_handle_case_and_at_insensitive():
    with db.SessionLocal() as s:
        personas.upsert_persona(s, _doc()); s.commit()
        assert personas.find_persona(s, "ada").user_id == "900001"
        assert personas.find_persona(s, "@ada").user_id == "900001"
        assert personas.find_persona(s, "ADA").user_id == "900001"

def test_find_miss_returns_none():
    with db.SessionLocal() as s:
        assert personas.find_persona(s, "nobody") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_persona_lookup.py -v`
Expected: FAIL — `AttributeError: module 'app.store.personas' has no attribute 'find_persona'`

- [ ] **Step 3: Implement `find_persona`**

Append to `backend/app/store/personas.py` (top imports already have `select` and `db`; add `from sqlalchemy import func` to the existing sqlalchemy import line):

```python
def find_persona(session, handle_or_id: str) -> PersonaDocument | None:
    """Resolve a persona by numeric user id OR @handle (case-insensitive, '@' optional)."""
    raw = handle_or_id.strip()
    if raw.isdigit():
        return get_persona(session, raw)
    name = raw.lstrip("@").lower()
    row = session.execute(
        select(db.PersonaRow).where(
            func.lower(func.replace(db.PersonaRow.doc["handle"].astext, "@", "")) == name
        )
    ).scalars().first()
    return PersonaDocument(**row.doc) if row else None
```

Update the import line at the top of the file from `from sqlalchemy import select` to `from sqlalchemy import select, func`.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_persona_lookup.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/store/personas.py backend/tests/test_persona_lookup.py
git commit -m "feat(mcp): personas.find_persona — lookup by handle or id"
```

---

### Task 4: Semantic search core

**Files:**
- Create: `backend/app/retrieval/search.py`
- Test: `backend/tests/test_search.py`

**Interfaces:**
- Consumes: `db.PersonaRow`, `PersonaDocument`, `Embedder` protocol (has `.embed(text) -> list[float]`) or `None`.
- Produces: `def search(session, embedder, query: str, k: int = 10, seed_account_id: str | None = None) -> dict`.
  - Ready shape: `{"status": "ok", "results": [{"user_id","handle","display_name","one_liner","ranked_interests","score"}, ...]}`
  - Not-ready shape: `{"status": "embeddings_not_ready", "results": []}`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_search.py
import pytest
from app.store import db
from app.retrieval import search as search_core
from app.retrieval.embedder import FakeEmbedder
from app.models.persona import PersonaDocument, PersonaCard

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.commit()
    yield
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.commit()

def _insert(s, uid, handle, interests, vec, seed="seed"):
    d = PersonaDocument(
        seed_account_id=seed, relationship="follower", enrichment_tier=2,
        user_id=uid, handle=handle, display_name=handle.lstrip("@").title(),
        profile_url=f"https://x.com/{handle.lstrip('@')}", profile_image_url="http://img",
        account_age_days=1, verified=False, bio=f"I love {interests[0]}",
        metrics={"followers_count": 1, "following_count": 1, "tweet_count": 1, "listed_count": 0},
        persona_card=PersonaCard(archetype="a", one_liner=f"Into {interests[0]}",
            ranked_interests=interests, preferred_formats=["threads"], tone_affinity="neutral",
            conversion_levers=["value"], summary="s"),
    )
    s.merge(db.PersonaRow(user_id=uid, seed_account_id=seed, relationship="follower",
        enrichment_tier=2, doc=d.model_dump(), vector=vec))

def test_not_ready_when_no_vectors():
    with db.SessionLocal() as s:
        _insert(s, "u1", "@a", ["ai"], None); s.commit()
        out = search_core.search(s, FakeEmbedder([1.0, 0.0, 0.0]), "ai", k=5)
    assert out["status"] == "embeddings_not_ready"
    assert out["results"] == []

def test_not_ready_when_embedder_none():
    with db.SessionLocal() as s:
        _insert(s, "u1", "@a", ["ai"], [1.0, 0.0, 0.0]); s.commit()
        out = search_core.search(s, None, "ai", k=5)
    assert out["status"] == "embeddings_not_ready"

def test_ranks_by_cosine_similarity():
    with db.SessionLocal() as s:
        _insert(s, "u1", "@ai", ["ai"], [1.0, 0.0, 0.0])
        _insert(s, "u2", "@design", ["design"], [0.0, 1.0, 0.0])
        _insert(s, "u3", "@robotics", ["robotics"], [0.9, 0.1, 0.0])
        s.commit()
        out = search_core.search(s, FakeEmbedder([1.0, 0.0, 0.0]), "ai", k=2)
    assert out["status"] == "ok"
    assert [r["user_id"] for r in out["results"]] == ["u1", "u3"]
    assert out["results"][0]["score"] >= out["results"][1]["score"]
    assert out["results"][0]["ranked_interests"] == ["ai"]

def test_seed_account_filter():
    with db.SessionLocal() as s:
        _insert(s, "u1", "@a", ["ai"], [1.0, 0.0, 0.0], seed="seedA")
        _insert(s, "u2", "@b", ["ai"], [1.0, 0.0, 0.0], seed="seedB")
        s.commit()
        out = search_core.search(s, FakeEmbedder([1.0, 0.0, 0.0]), "ai", k=5,
                                 seed_account_id="seedB")
    assert [r["user_id"] for r in out["results"]] == ["u2"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_search.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.retrieval.search'`

- [ ] **Step 3: Implement the core**

`backend/app/retrieval/search.py`:

```python
"""Semantic search over persona embeddings (pgvector cosine).

Pure logic: a session and an embedder are passed in (DI). Degrades to
`embeddings_not_ready` when the embedder is absent or no vectors are stored yet,
so the tool never errors before Layer B populates personas.vector.
"""
from __future__ import annotations

from sqlalchemy import select, func
from app.store import db

_NOT_READY = {"status": "embeddings_not_ready", "results": []}


def _summary(doc: dict, distance: float) -> dict:
    card = doc.get("persona_card") or {}
    one_liner = card.get("one_liner") or (doc.get("bio", "")[:120])
    return {
        "user_id": doc["user_id"],
        "handle": doc["handle"],
        "display_name": doc["display_name"],
        "one_liner": one_liner,
        "ranked_interests": card.get("ranked_interests", []),
        "score": round(1.0 - float(distance), 4),
    }


def search(session, embedder, query: str, k: int = 10,
           seed_account_id: str | None = None) -> dict:
    if embedder is None:
        return dict(_NOT_READY)
    have_vectors = session.execute(
        select(func.count()).select_from(db.PersonaRow)
        .where(db.PersonaRow.vector.isnot(None))
    ).scalar_one()
    if not have_vectors:
        return dict(_NOT_READY)

    qvec = embedder.embed(query)
    distance = db.PersonaRow.vector.cosine_distance(qvec)
    stmt = (
        select(db.PersonaRow.doc, distance.label("distance"))
        .where(db.PersonaRow.vector.isnot(None))
    )
    if seed_account_id is not None:
        stmt = stmt.where(db.PersonaRow.seed_account_id == seed_account_id)
    stmt = stmt.order_by(distance.asc()).limit(k)

    rows = session.execute(stmt).all()
    return {"status": "ok", "results": [_summary(doc, dist) for doc, dist in rows]}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_search.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/retrieval/search.py backend/tests/test_search.py
git commit -m "feat(mcp): semantic search core over pgvector, graceful not-ready"
```

---

### Task 5: MCP server (tools)

**Files:**
- Create: `backend/app/mcp/__init__.py` (empty)
- Create: `backend/app/mcp/server.py`
- Test: `backend/tests/test_mcp.py`

**Interfaces:**
- Consumes: `db.SessionLocal`, `personas.find_persona`, `search_core.search`, `get_embedder`.
- Produces: module-level `mcp: FastMCP` with tools `search(query, k=10, seed_account_id=None)` and `get_persona(handle_or_id)`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_mcp.py
import asyncio
import pytest
from app.store import db, personas
from app.models.persona import PersonaDocument

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.commit()
    yield
    with db.SessionLocal() as s:
        s.query(db.PersonaRow).delete(); s.commit()

def _doc(uid="700001", handle="@Grace"):
    return PersonaDocument(
        seed_account_id="seed", relationship="follower", enrichment_tier=1,
        user_id=uid, handle=handle, display_name="Grace", profile_url="https://x.com/grace",
        profile_image_url="http://img", account_age_days=1, verified=False, bio="compilers",
        metrics={"followers_count": 1, "following_count": 1, "tweet_count": 1, "listed_count": 0},
    )

def test_tools_registered():
    from app.mcp.server import mcp
    names = {t.name for t in asyncio.run(mcp.list_tools())}
    assert {"search", "get_persona"} <= names

def test_get_persona_tool_returns_seeded_user():
    from app.mcp.server import get_persona
    with db.SessionLocal() as s:
        personas.upsert_persona(s, _doc()); s.commit()
    out = get_persona("@grace")
    assert out["user_id"] == "700001" and out["handle"] == "@Grace"

def test_get_persona_miss():
    from app.mcp.server import get_persona
    assert get_persona("nobody")["status"] == "not_found"

def test_search_tool_not_ready_without_key(monkeypatch):
    import app.retrieval.embedder as emb
    monkeypatch.setattr(emb.settings, "gemini_api_key", "")
    from app.mcp.server import search
    assert search("ai", k=3)["status"] == "embeddings_not_ready"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_mcp.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.mcp'`

- [ ] **Step 3: Create the MCP server**

`backend/app/mcp/__init__.py`: empty file.

`backend/app/mcp/server.py`:

```python
"""MCP server exposing the ingested X audience to MCP-native agents.

Thin skin over app/retrieval (search) and app/store/personas (lookup). Tool
docstrings are the agent-facing contract — write them for an LLM caller.
Mounted into FastAPI at /mcp in app/main.py.
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from app.store import db, personas
from app.retrieval import search as search_core
from app.retrieval.embedder import get_embedder

mcp = FastMCP("AgentSim Audience", stateless_http=True)
# Mounted under /mcp in main.py; keep this app's internal path at root so the
# public endpoint is exactly /mcp (not /mcp/mcp).
mcp.settings.streamable_http_path = "/"


@mcp.tool()
def search(query: str, k: int = 10, seed_account_id: str | None = None) -> dict:
    """Semantically search the ingested X audience for people matching a description.

    Args:
        query: natural-language description of the people to find
            (e.g. "founders interested in AI agents").
        k: max number of personas to return (default 10).
        seed_account_id: optional — restrict to one ingested audience.

    Returns a dict with "status" and "results" (ranked personas with a similarity
    "score"). status == "embeddings_not_ready" means embeddings are not populated
    yet; try get_persona or retry later.
    """
    with db.SessionLocal() as s:
        return search_core.search(s, get_embedder(), query, k=k,
                                  seed_account_id=seed_account_id)


@mcp.tool()
def get_persona(handle_or_id: str) -> dict:
    """Fetch one ingested persona by @handle or numeric user id.

    Returns the full persona document (identity, metrics, persona card), or
    {"status": "not_found"} if no such person was ingested.
    """
    with db.SessionLocal() as s:
        doc = personas.find_persona(s, handle_or_id)
    if doc is None:
        return {"status": "not_found", "handle_or_id": handle_or_id}
    return doc.model_dump(mode="json")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_mcp.py -v`
Expected: PASS (4 tests)

Note: `@mcp.tool()` returns the original function, so importing `search`/`get_persona` and calling them directly (as the tests do) works.

- [ ] **Step 5: Commit**

```bash
git add backend/app/mcp/__init__.py backend/app/mcp/server.py backend/tests/test_mcp.py
git commit -m "feat(mcp): FastMCP server with search + get_persona tools"
```

---

### Task 6: Mount MCP into FastAPI + docs

**Files:**
- Modify: `backend/app/main.py` (convert startup/shutdown to a `lifespan`, mount `/mcp`)
- Modify: `backend/README.md` (add MCP section)
- Test: `backend/tests/test_mcp_mount.py`

**Interfaces:**
- Consumes: `app.mcp.server.mcp`.
- Produces: FastAPI app with the MCP streamable-HTTP app mounted at `/mcp`; MCP session-manager lifespan runs alongside the existing DB init + worker loop.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_mcp_mount.py
from app.main import app

def test_mcp_mounted():
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/mcp" in paths

def test_health_route_still_present():
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/health" in paths
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_mcp_mount.py -v`
Expected: FAIL — `/mcp` not in the route paths.

- [ ] **Step 3: Rewire `main.py` to a lifespan and mount MCP**

In `backend/app/main.py`, replace the imports block and the `@app.on_event("startup")` / `@app.on_event("shutdown")` handlers with a single lifespan. Concretely:

Change the top of the file from:

```python
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
```

to:

```python
import asyncio
import contextlib
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from app.config import settings
from app.store import db, jobs, personas, budget, clusters_stub
from app.models.job import IngestRequest
from app.mcp.server import mcp as mcp_server


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    worker_task = None
    # Never start the live worker loop under pytest — it would make real X calls.
    if not os.environ.get("PYTEST_CURRENT_TEST"):
        worker_task = asyncio.create_task(worker_loop())
    # Run the MCP streamable-HTTP session manager for the app's lifetime.
    async with mcp_server.session_manager.run():
        yield
    if worker_task is not None:
        worker_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker_task


app = FastAPI(title="AgentSim Ingestion", lifespan=lifespan)
app.mount("/mcp", mcp_server.streamable_http_app())
```

Leave `worker_loop()` and all route handlers below unchanged.

- [ ] **Step 4: Run the mount test**

Run: `uv run pytest tests/test_mcp_mount.py -v`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the FULL suite (regression guard)**

Run: `uv run pytest -q`
Expected: all tests pass (previous suite + new tests). The lifespan change must not break `test_api.py` / `test_health.py` (which use `TestClient`). If `TestClient` hangs or errors on the MCP session manager, the fix is to keep the mount but confirm `stateless_http=True` is set on the FastMCP instance (Task 5) — that path requires no long-lived session and starts/stops cleanly.

- [ ] **Step 6: Document in README**

Append a section to `backend/README.md`:

```markdown
## MCP server (audience tools for Claude/Cursor)

The backend exposes an MCP server at `http://localhost:8000/mcp` (streamable-HTTP)
with two tools:

- `search(query, k=10, seed_account_id=None)` — semantic search over persona
  embeddings. Returns ranked personas, or `embeddings_not_ready` until Layer B
  populates `personas.vector`.
- `get_persona(handle_or_id)` — fetch one persona by @handle or user id.

Query embeddings use Gemini (`gemini-embedding-001`, 1536-d) to match Layer B's
vector space — set `GEMINI_API_KEY`.

Connect from an MCP client (e.g. Claude Desktop / Cursor) with:

```json
{ "mcpServers": { "agentsim": { "url": "http://localhost:8000/mcp" } } }
```
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/main.py backend/tests/test_mcp_mount.py backend/README.md
git commit -m "feat(mcp): mount MCP at /mcp via lifespan; README connect guide"
```

---

## Self-Review

**1. Spec coverage:**
- MCP server mounted at `/mcp`, streamable-HTTP → Task 6. ✅
- `search` semantic + graceful not-ready → Task 4 (core) + Task 5 (tool). ✅
- `get_persona` by handle/id → Task 3 (store) + Task 5 (tool). ✅
- Gemini query embedder, config-driven, matches B (model/dim/task_type) → Task 1 (config) + Task 2 (embedder). ✅
- One-responsibility modules; core doesn't import interface → Tasks 2/4 (core) vs Task 5 (mcp). ✅
- Graceful degradation (no key / no vectors) → Tasks 4, 5 tests. ✅
- Tests local Postgres, no network → all tests use FakeEmbedder / monkeypatch. ✅
- No schema change → confirmed; `personas.vector` used as-is. ✅
- Out of scope (clusters, auth, proxy) → not implemented. ✅

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step has complete code. ✅

**3. Type consistency:** `Embedder.embed(text) -> list[float]` used consistently (Task 2 → Task 4/5). `find_persona(session, handle_or_id) -> PersonaDocument | None` (Task 3) consumed in Task 5. `search(session, embedder, query, k, seed_account_id) -> dict` (Task 4) consumed by the `search` tool (Task 5). `get_embedder() -> Embedder | None` (Task 2) consumed in Task 5. Result summary keys match between `_summary` (Task 4) and its test assertions. ✅

**Known risk (flagged for execution):** FastMCP-into-FastAPI lifespan mounting (Task 6) is the one integration subtlety; the full-suite regression run in Step 5 is the gate. If mounting fights `TestClient`, `stateless_http=True` is the escape hatch and is already set in Task 5.
