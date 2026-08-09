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


def test_engager_seeded_ingest(monkeypatch):
    """relationship='engager': population = likers/retweeters of seed posts,
    ranked by engagement count, with seed_engagement populated from counts."""
    from app import worker
    from app.models.job import IngestJob, IngestParams
    from app.ingest.x_client import XClient
    from app.store import personas
    from app.store.db import SessionLocal
    from sqlalchemy import text as _text

    class EngagerAPI(FakeAPI):
        def get_recent_seed_posts(self, sid, **kw):
            return ["p1", "p2"]

        def get_liking_users(self, pid):
            return [{"id": "e1", "username": "eng1", "name": "E One",
                     "description": "ml researcher", "public_metrics": {"followers_count": 10, "following_count": 1, "tweet_count": 5, "listed_count": 0}, "_engaged_at": "2026-08-08T00:00:00Z"}]

        def get_retweeters(self, pid):
            return ([{"id": "e2", "username": "eng2", "name": "E Two",
                      "description": "founder building agents", "public_metrics": {"followers_count": 99, "following_count": 1, "tweet_count": 5, "listed_count": 0}, "_engaged_at": "2026-08-08T00:00:00Z"}]
                    if pid == "p1" else [])

        def get_users_bulk(self, ids):
            # engager stubs are incomplete -> bulk hydration returns full objects
            full = {
                "e1": {"id": "e1", "username": "eng1", "name": "E One", "created_at": "2020-01-01T00:00:00Z",
                       "description": "ml researcher", "public_metrics": {"followers_count": 10, "following_count": 1, "tweet_count": 5, "listed_count": 0}},
                "e2": {"id": "e2", "username": "eng2", "name": "E Two", "created_at": "2021-01-01T00:00:00Z",
                       "description": "founder building agents", "public_metrics": {"followers_count": 99, "following_count": 1, "tweet_count": 5, "listed_count": 0}},
            }
            return [full[i] for i in ids if i in full]

    s = SessionLocal()
    s.execute(_text("DELETE FROM personas WHERE user_id IN ('e1','e2')")); s.commit()
    job = IngestJob(job_id="test-engager", seed="@seedco", relationship="engager",
                    params=IngestParams(sample_pct=1.0, max_followers=10, posts_per_user=2),
                    created_at="2026-08-09T00:00:00Z", updated_at="2026-08-09T00:00:00Z")
    from app.store import jobs as jobs_store
    jobs_store.save(s, job); s.commit()

    worker.run_job(s, job, XClient(EngagerAPI()), grok_client=None)
    assert job.status == "done", job.error
    assert job.progress.discovered == 2
    p1 = personas.get_persona(s, "e1")
    assert p1.relationship == "engager"
    assert p1.seed_engagement.likes_on_seed_posts == 2  # liked both posts
    p2 = personas.get_persona(s, "e2")
    assert p2.seed_engagement.reposts == 1
    s.execute(_text("DELETE FROM personas WHERE user_id IN ('e1','e2')"))
    s.execute(_text("DELETE FROM jobs WHERE job_id='test-engager'")); s.commit(); s.close()


def test_enrich_all_deep_enriches_existing_tier1(monkeypatch):
    """enrich_all: no discovery — every bio-having tier-1 persona for the seed
    gets tier-2 enrichment; stored seed_engagement survives the empty fetch."""
    from app import worker
    from app.models.job import IngestJob, IngestParams
    from app.models.persona import SeedEngagement
    from app.ingest.x_client import XClient
    from app.store import personas, jobs as jobs_store
    from app.store.db import SessionLocal
    from app.pipeline import enrich_tier1
    from sqlalchemy import text as _text

    class EnrichAPI(FakeAPI):
        def get_user(self, h):
            return {"id": "seedEA", "username": "seedea", "name": "Seed", "created_at": "2020-01-01T00:00:00Z",
                    "description": "seed", "public_metrics": {"followers_count": 1, "following_count": 1, "tweet_count": 1, "listed_count": 0}}

    s = SessionLocal()
    s.execute(_text("DELETE FROM personas WHERE user_id IN ('ea1','ea2','ea3')")); s.commit()
    for uid, bio in [("ea1", "ml engineer"), ("ea2", ""), ("ea3", "designer")]:
        enrich_tier1(s, {"id": uid, "username": uid, "name": uid, "created_at": "2021-01-01T00:00:00Z",
                         "description": bio, "public_metrics": {"followers_count": 5, "following_count": 1, "tweet_count": 3, "listed_count": 0}},
                     "seedEA")
    # ea1 has stored engagement that must survive
    p = personas.get_persona(s, "ea1")
    p.seed_engagement = SeedEngagement(likes_on_seed_posts=7)
    personas.upsert_persona(s, p); s.commit()

    job = IngestJob(job_id="test-enrichall", seed="@seedea",
                    params=IngestParams(enrich_all=True, posts_per_user=2),
                    created_at="2026-08-09T00:00:00Z", updated_at="2026-08-09T00:00:00Z")
    jobs_store.save(s, job); s.commit()
    worker.run_job(s, job, XClient(EnrichAPI()), grok_client=None)
    assert job.status == "done", job.error
    assert job.progress.sampled == 2                       # ea2 (empty bio) excluded
    assert personas.get_persona(s, "ea1").enrichment_tier == 2
    assert personas.get_persona(s, "ea3").enrichment_tier == 2
    assert personas.get_persona(s, "ea2").enrichment_tier == 1
    assert personas.get_persona(s, "ea1").seed_engagement.likes_on_seed_posts == 7
    s.execute(_text("DELETE FROM personas WHERE user_id IN ('ea1','ea2','ea3')"))
    s.execute(_text("DELETE FROM jobs WHERE job_id='test-enrichall'")); s.commit(); s.close()
