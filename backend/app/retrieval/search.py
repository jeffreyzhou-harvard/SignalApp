"""Semantic search over persona embeddings (pgvector cosine).

Pure logic: a session and an embedder are passed in (DI). Never raises to the
caller — degrades to a status dict:
  - `embeddings_not_ready`: no embedder configured, or no vectors stored yet
  - `query_embed_failed`: the query embedding call failed (e.g. Gemini quota /
    429 / network) — transient, worth retrying
so the MCP tool returns a clean payload instead of a 500.
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

    try:
        qvec = embedder.embed(query)
    except Exception as e:  # quota / network / provider error — don't 500 the tool
        return {"status": "query_embed_failed", "results": [], "detail": str(e)[:200]}
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
