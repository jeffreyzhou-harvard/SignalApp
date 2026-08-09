"""Run full-depth enrichment for a seed directly in-process (no job queue) —
for when the queue is contested by workers on older code.

Usage: <env vars> PYTHONPATH=. uv run python scripts/enrich_all_direct.py <seed_account_id>
"""
import sys

from app import pipeline
from app.config import settings
from app.enrich import persona_card
from app.ingest.tweepy_adapter import make_api, make_grok
from app.ingest.x_client import XClient
from app.store import personas
from app.store.db import SessionLocal


def main(seed_account_id: str) -> None:
    s = SessionLocal()
    docs = personas.list_personas(s, seed_account_id, limit=100_000)
    targets = [d.user_id for d in docs if d.bio.strip() and d.enrichment_tier == 1]
    print(f"{len(docs)} personas; {len(targets)} bio-having tier-1 to enrich")

    xclient = XClient(make_api())
    grok = make_grok()
    engagers = {"likes": {}, "reposts": {}, "replies": {}, "last": {}}
    preps, failed = [], 0
    for i, uid in enumerate(targets):
        try:
            prep = pipeline.enrich_tier2_fetch(s, uid, seed_account_id, xclient,
                                               10, engagers, None)
            if prep is not None:
                preps.append(prep)
        except Exception as e:
            failed += 1
            if failed <= 5:
                print(f"  fetch failed {uid}: {str(e)[:80]}")
        if (i + 1) % 100 == 0:
            print(f"  fetched {i + 1}/{len(targets)}")
            s.commit()
    print(f"{len(preps)} fetched, {failed} failed; generating cards…")
    # Commit now: card generation is minutes of pure API work, and an open
    # transaction idling that long gets killed by Neon's idle-in-transaction
    # timeout (which once cost a full card run). Then interleave generation and
    # writes in chunks so progress persists and the connection stays warm.
    s.commit()

    CHUNK = 64
    for i in range(0, len(preps), CHUNK):
        chunk = preps[i:i + CHUNK]
        cards = persona_card.generate_cards_concurrent(
            [(p.bio, p.content) for p in chunk],
            client=grok, concurrency=settings.enrich_concurrency,
        )
        for prep, card in zip(chunk, cards):
            pipeline.enrich_tier2_write(s, prep, card)
        s.commit()
        print(f"  written {min(i + CHUNK, len(preps))}/{len(preps)}")
    print(f"enriched {len(preps)} personas to tier-2")


if __name__ == "__main__":
    main(sys.argv[1])
