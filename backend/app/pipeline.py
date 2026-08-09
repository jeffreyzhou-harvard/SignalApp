from dataclasses import dataclass
from datetime import datetime, timezone
from app.ingest import clean
from app.store import personas
from app.models.persona import Content, PersonaDocument


def _now_iso(): return datetime.now(timezone.utc).isoformat()


@dataclass
class Tier2Prep:
    """Everything gathered serially for one user (DB reads + timeline fetch),
    ready for the I/O-bound Grok card call to run concurrently across users."""
    user_id: str
    ident: dict
    content: Content
    seed_engagement: object

    @property
    def bio(self) -> str:
        return self.ident["bio"]


def enrich_tier1(session, raw_user: dict, seed_id: str,
                 relationship: str = "follower") -> PersonaDocument:
    existing = personas.get_persona(session, str(raw_user["id"]))
    if existing is not None and existing.enrichment_tier == 2:
        return existing  # never demote an enriched persona (double-worker lesson)
    ident = clean.build_identity(raw_user, seed_id, tier=1, now_iso=_now_iso())
    ident["relationship"] = relationship
    doc = PersonaDocument(**ident)
    personas.upsert_persona(session, doc)
    return doc


def enrich_tier2_fetch(session, user_id, seed_id, xclient, posts_per_user, engagers, job_id) -> Tier2Prep | None:
    """Serial, session-bound: DB reads + timeline fetch + budget accounting.
    Returns None if the user is already tier-2 enriched (idempotent skip).
    The Grok card call is deliberately excluded so it can be batched concurrently."""
    existing = personas.get_persona(session, user_id)
    if existing and existing.enrichment_tier == 2:
        return None                         # idempotent skip
    raw_user = personas.get_cached_user(session, user_id)
    if raw_user is not None:
        ident = clean.build_identity(raw_user, seed_id, tier=2, now_iso=_now_iso())
    elif existing is not None:
        # no raw cache (e.g. enrich_all on an old ingest) — reuse stored identity
        ident = existing.model_dump(
            exclude={"content", "persona_card", "embedding", "seed_engagement"})
        ident["enrichment_tier"] = 2
    else:
        raise ValueError(f"no cached user or persona for {user_id}")
    if existing is not None:
        ident["relationship"] = existing.relationship  # engager-seeded stays engager
    tweets = xclient.fetch_timeline(session, user_id, max_results=posts_per_user, job_id=job_id)
    content = clean.build_content(tweets)
    se = clean.aggregate_seed_engagement(user_id, engagers)
    no_engagement_data = not (engagers.get("likes") or engagers.get("reposts"))
    if no_engagement_data and existing is not None and existing.seed_engagement is not None:
        se = existing.seed_engagement  # never zero stored counts with an empty fetch
    return Tier2Prep(user_id=user_id, ident=ident, content=content, seed_engagement=se)


def enrich_tier2_write(session, prep: Tier2Prep, card) -> PersonaDocument:
    """Serial, session-bound: assemble the tier-2 document with its (already
    generated) persona card and persist it."""
    doc = PersonaDocument(**prep.ident, content=prep.content,
                          persona_card=card, seed_engagement=prep.seed_engagement)
    personas.upsert_persona(session, doc)
    return doc
