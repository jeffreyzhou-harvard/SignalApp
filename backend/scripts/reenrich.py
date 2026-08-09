"""Directly re-enrich a job's tier-2 members, bypassing the job queue.

Recovery tool for the double-worker incident: tier-1 upserts from a concurrently
re-run job demoted enriched personas. Reads member_ids from the given job,
re-runs fetch (cache-hits → ~free) + concurrent persona cards + write.

Usage:
    DATABASE_URL=... X_AI_BEARER_TOKEN=... X_AI_API_KEY=... \
      PYTHONPATH=. uv run python scripts/reenrich.py <job_id>
"""
import sys

from app import pipeline
from app.config import settings
from app.enrich import persona_card
from app.ingest.tweepy_adapter import make_api, make_grok
from app.ingest.x_client import XClient
from app.store import jobs
from app.store.db import SessionLocal


def main(job_id: str) -> None:
    s = SessionLocal()
    job = jobs.get_job(s, job_id)
    if job is None:
        raise SystemExit(f"job {job_id} not found")
    xclient = XClient(make_api())
    grok = make_grok()
    engagers = {"likes": set(), "reposts": set(), "replies": set(), "last": {}}

    preps, skipped, failed = [], 0, 0
    for uid in job.member_ids:
        try:
            prep = pipeline.enrich_tier2_fetch(s, uid, job.seed_account_id, xclient,
                                               job.params.posts_per_user, engagers, job_id)
        except Exception as e:
            failed += 1
            print(f"  fetch failed {uid}: {e}")
            continue
        if prep is None:
            skipped += 1
        else:
            preps.append(prep)
    print(f"{len(preps)} to enrich, {skipped} already tier-2, {failed} failed")

    cards = persona_card.generate_cards_concurrent(
        [(p.bio, p.content) for p in preps],
        client=grok, concurrency=settings.enrich_concurrency,
    )
    for prep, card in zip(preps, cards):
        pipeline.enrich_tier2_write(s, prep, card)
    s.commit()
    print(f"re-enriched {len(preps)} personas")


if __name__ == "__main__":
    main(sys.argv[1])
