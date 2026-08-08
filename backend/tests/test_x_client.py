import pytest
from app.store import db, budget, personas
from app.ingest.x_client import XClient

class FakeAPI:
    def __init__(self): self.calls = 0
    def get_users_tweets(self, user_id, **kw):
        self.calls += 1
        return [{"id": "1", "text": "hi", "created_at": "2026-08-05T00:00:00Z",
                 "public_metrics": {"like_count": 1, "reply_count": 0, "retweet_count": 0, "bookmark_count": 0}}]

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        s.query(db.RawTweetRow).delete(); s.query(db.LedgerRow).delete(); s.commit()
    yield

def test_timeline_cache_hit_avoids_second_api_call_and_is_free():
    api = FakeAPI(); client = XClient(api=api)
    with db.SessionLocal() as s:
        client.fetch_timeline(s, "u1", max_results=10, job_id="j"); s.commit()
        first_spent = budget.spent(s)
        client.fetch_timeline(s, "u1", max_results=10, job_id="j"); s.commit()
    assert api.calls == 1                       # second call served from cache
    with db.SessionLocal() as s:
        assert budget.spent(s) == first_spent   # dedup hit added $0
