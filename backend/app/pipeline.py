from datetime import datetime, timezone
from app.ingest import clean
from app.enrich import persona_card
from app.store import personas
from app.models.persona import PersonaDocument


def _now_iso(): return datetime.now(timezone.utc).isoformat()


def enrich_tier1(session, raw_user: dict, seed_id: str) -> PersonaDocument:
    ident = clean.build_identity(raw_user, seed_id, tier=1, now_iso=_now_iso())
    doc = PersonaDocument(**ident)
    personas.upsert_persona(session, doc)
    return doc


def enrich_tier2(session, user_id, seed_id, xclient, grok_client, posts_per_user, engagers, job_id):
    existing = personas.get_persona(session, user_id)
    if existing and existing.enrichment_tier == 2:
        return existing                     # idempotent skip
    raw_user = personas.get_cached_user(session, user_id)
    ident = clean.build_identity(raw_user, seed_id, tier=2, now_iso=_now_iso())
    tweets = xclient.fetch_timeline(session, user_id, max_results=posts_per_user, job_id=job_id)
    content = clean.build_content(tweets)
    card = persona_card.generate_card(ident["bio"], content, client=grok_client)
    se = clean.aggregate_seed_engagement(user_id, engagers)
    doc = PersonaDocument(**ident, content=content, persona_card=card, seed_engagement=se)
    personas.upsert_persona(session, doc)
    return doc
