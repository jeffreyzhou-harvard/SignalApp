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
    assert {
        "search", "get_persona", "list_audiences", "audience_overview",
        "list_clusters", "get_cluster_members", "whose_tribe", "top_interests",
    } <= names


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
