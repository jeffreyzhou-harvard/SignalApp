from datetime import datetime, timezone
from sqlalchemy import select, func
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
        user_id=doc.user_id,
        seed_account_id=doc.seed_account_id,
        relationship=doc.relationship,
        enrichment_tier=doc.enrichment_tier,
        doc=doc.model_dump(),
        vector=None,
    ))


def get_persona(session, user_id: str) -> PersonaDocument | None:
    row = session.get(db.PersonaRow, user_id)
    return PersonaDocument(**row.doc) if row else None


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


def list_personas(session, seed_account_id: str, limit: int = 100, offset: int = 0) -> list[PersonaDocument]:
    rows = session.execute(
        select(db.PersonaRow)
        .where(db.PersonaRow.seed_account_id == seed_account_id)
        .limit(limit)
        .offset(offset)
    ).scalars().all()
    return [PersonaDocument(**r.doc) for r in rows]
