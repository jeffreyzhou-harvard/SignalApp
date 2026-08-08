import threading
import time
from types import SimpleNamespace

import pytest
from app.store import db, jobs, personas
from app.models.job import IngestRequest
from app.models.persona import PersonaCard
from app.ingest.x_client import XClient
from app import worker


class SleepyGrok:
    """Fake grok client that sleeps per card call and records peak concurrency,
    so a test can prove the worker generates cards in parallel, not serially."""

    def __init__(self, delay: float):
        self.delay = delay
        self._live = 0
        self.max_concurrent = 0
        self._lock = threading.Lock()
        self.beta = SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(parse=self._parse))
        )

    def _parse(self, *, model, messages, response_format):
        with self._lock:
            self._live += 1
            self.max_concurrent = max(self.max_concurrent, self._live)
        time.sleep(self.delay)
        with self._lock:
            self._live -= 1
        card = PersonaCard(
            archetype="a", one_liner="o", ranked_interests=["x"],
            preferred_formats=["threads"], tone_affinity="neutral",
            conversion_levers=["value"], summary="s",
        )
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=card))])

class FakeAPI:
    def get_user(self, h): return {"id": "seed", "username": "seed", "name": "Seed",
        "created_at": "2020-01-01T00:00:00Z", "public_metrics": {"followers_count": 3,
        "following_count": 0, "tweet_count": 0, "listed_count": 0}}
    def get_users_followers(self, sid, **kw):
        yield [{"id": f"u{i}", "username": f"u{i}", "name": f"U{i}",
                "description": "rust dev", "created_at": "2021-01-01T00:00:00Z",
                "public_metrics": {"followers_count": i, "following_count": 1,
                                   "tweet_count": 5, "listed_count": 0}} for i in range(3)]
    def get_recent_seed_posts(self, sid, **kw): return ["p1"]
    def get_liking_users(self, pid): return [{"id": "u2", "_engaged_at": "2026-08-06T00:00:00Z"}]
    def get_retweeters(self, pid): return []
    def get_users_tweets(self, uid, **kw):
        return [{"id": f"{uid}-t", "text": "rust is great", "created_at": "2026-08-05T00:00:00Z",
                 "public_metrics": {"like_count": 2, "reply_count": 0, "retweet_count": 0, "bookmark_count": 0},
                 "context_annotations": [{"domain": {"name": "Tech"}, "entity": {"name": "Rust"}}]}]

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        for t in (db.PersonaRow, db.JobRow, db.LedgerRow, db.RawUserRow, db.RawTweetRow):
            s.query(t).delete()
        s.commit()
    yield

def test_worker_runs_job_end_to_end():
    with db.SessionLocal() as s:
        job = jobs.create_job(s, IngestRequest(seed="@seed", sample_pct=1.0, max_followers=3)); s.commit()
        xclient = XClient(api=FakeAPI(), soft_limit=1000)
        done = worker.run_job(s, job, xclient, grok_client=None); s.commit()
        assert done.status.value == "done"
        assert done.progress.discovered == 3
        # tier-1 written for all, tier-2 for the sampled set
        u2 = personas.get_persona(s, "u2")
        assert u2.enrichment_tier == 2 and u2.content is not None
        assert u2.seed_engagement.likes_on_seed_posts == 1   # u2 liked seed post


def test_worker_generates_persona_cards_concurrently():
    grok = SleepyGrok(delay=0.1)
    with db.SessionLocal() as s:
        job = jobs.create_job(s, IngestRequest(seed="@seed", sample_pct=1.0, max_followers=3)); s.commit()
        xclient = XClient(api=FakeAPI(), soft_limit=1000)
        done = worker.run_job(s, job, xclient, grok_client=grok); s.commit()
        assert done.status.value == "done"
        assert done.progress.enriched == 3
        # every sampled user got a Grok-generated card
        for uid in ("u0", "u1", "u2"):
            assert personas.get_persona(s, uid).persona_card is not None
    # the three card calls overlapped instead of running one at a time
    assert grok.max_concurrent > 1
