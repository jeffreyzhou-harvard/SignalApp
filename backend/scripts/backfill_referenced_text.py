"""Backfill SamplePost.referenced_text for already-ingested personas.

Old ingests resolved referenced authors but discarded parent bodies. This
collects referenced tweet ids from tier-2 persona docs, batch-fetches them
(GET /2/tweets, 100 ids/call — cheap), and patches the docs in place.

Usage:
    DATABASE_URL=... X_AI_BEARER_TOKEN=... uv run python scripts/backfill_referenced_text.py <seed_account_id>
"""
import sys

import tweepy
from sqlalchemy import text

from app.config import settings
from app.store import budget
from app.store.db import SessionLocal


def main(seed: str) -> None:
    s = SessionLocal()
    rows = s.execute(text(
        "SELECT user_id, doc FROM personas"
        " WHERE seed_account_id=:s AND enrichment_tier=2"), {"s": seed}).all()

    # collect referenced ids missing text, from the raw cached tweets
    need: set[str] = set()
    cached = {uid: s.execute(text(
        "SELECT tweet_id, data FROM raw_tweets WHERE author_id=:u"), {"u": uid}).all()
        for uid, _ in rows}
    for uid, tweets in cached.items():
        for _, data in tweets:
            for ref in (data.get("referenced_tweets") or []):
                if not data.get("_referenced_text"):
                    need.add(str(ref["id"]))
    print(f"{len(rows)} tier-2 personas, {len(need)} parent tweets to fetch")

    client = tweepy.Client(bearer_token=settings.x_bearer_token, wait_on_rate_limit=True)
    bodies: dict[str, str] = {}
    ids = sorted(need)
    for i in range(0, len(ids), 100):
        chunk = ids[i : i + 100]
        resp = client.get_tweets(chunk, tweet_fields=["text"])
        budget.record_cost(s, resource="post", count=len(chunk), job_id=None)
        for t in resp.data or []:
            bodies[str(t.id)] = t.text
        print(f"  fetched {min(i + 100, len(ids))}/{len(ids)}")

    # patch raw cache and persona docs
    patched = 0
    for uid, doc in rows:
        tweets = cached[uid]
        by_created = {}
        for tid, data in tweets:
            refs = data.get("referenced_tweets") or []
            body = next((bodies.get(str(r["id"])) for r in refs if str(r["id"]) in bodies), None)
            if body:
                data["_referenced_text"] = body
                s.execute(text("UPDATE raw_tweets SET data=CAST(:d AS jsonb) WHERE tweet_id=:t"),
                          {"d": __import__("json").dumps(data), "t": tid})
                by_created[data.get("created_at")] = body
        content = (doc.get("content") or {})
        changed = False
        for p in content.get("sample_posts", []):
            body = by_created.get(p.get("created_at"))
            if body and not p.get("referenced_text"):
                p["referenced_text"] = body
                changed = True
        if changed:
            s.execute(text("UPDATE personas SET doc=CAST(:d AS jsonb) WHERE user_id=:u"),
                      {"d": __import__("json").dumps(doc), "u": uid})
            patched += 1
    s.commit()
    print(f"patched {patched} personas with referenced_text")


if __name__ == "__main__":
    main(sys.argv[1])
