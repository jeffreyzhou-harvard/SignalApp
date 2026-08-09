from app.config import settings
from app.store import personas, budget


class XClient:
    def __init__(self, api=None, soft_limit: float | None = None):
        self.api = api                       # tweepy.Client or a fake
        self.soft_limit = soft_limit if soft_limit is not None else settings.x_api_spend_soft_limit_usd

    def fetch_timeline(self, session, user_id: str, max_results: int, job_id: str) -> list[dict]:
        cached = personas.get_cached_tweets(session, user_id)
        if cached is not None:
            budget.record_cost(session, resource="post", count=len(cached), job_id=job_id, dedup_hit=True)
            return cached
        budget.guard(session, resource="post", count=max_results, soft_limit=self.soft_limit)
        tweets = list(self.api.get_users_tweets(user_id, max_results=max_results) or [])
        budget.record_cost(session, resource="post", count=len(tweets), job_id=job_id)
        personas.cache_tweets(session, user_id, tweets)
        return tweets

    def resolve_user(self, session, handle_or_id: str) -> dict:
        user = self.api.get_user(handle_or_id)     # fake/tweepy returns a dict
        personas.cache_user(session, str(user["id"]), user)
        budget.record_cost(session, resource="user", count=1)
        return user

    def fetch_followers(self, session, seed_id: str, max_followers: int, job_id: str) -> list[dict]:
        out = []
        for page in self.api.get_users_followers(seed_id, max_followers=max_followers):
            for u in page:
                personas.cache_user(session, str(u["id"]), u)
                out.append(u)
            budget.record_cost(session, resource="followers", count=len(page), job_id=job_id)
            if len(out) >= max_followers:
                break
        return out[:max_followers]

    def fetch_engagers(self, session, post_ids: list[str], job_id: str) -> dict:
        """Counts per user (a user liking 5 posts is 5x the signal of liking 1).
        Engager user objects are cached so engager-seeded ingest re-reads free."""
        likes, reposts, last = {}, {}, {}
        for pid in post_ids:
            for u in self.api.get_liking_users(pid) or []:
                uid = str(u["id"])
                likes[uid] = likes.get(uid, 0) + 1
                last[uid] = u.get("_engaged_at", "")
                if personas.get_cached_user(session, uid) is None:
                    personas.cache_user(session, uid, u)  # never clobber a richer cached object
                budget.record_cost(session, resource="engager", count=1, job_id=job_id)
            for u in self.api.get_retweeters(pid) or []:
                uid = str(u["id"])
                reposts[uid] = reposts.get(uid, 0) + 1
                last[uid] = u.get("_engaged_at", "")
                if personas.get_cached_user(session, uid) is None:
                    personas.cache_user(session, uid, u)
                budget.record_cost(session, resource="engager", count=1, job_id=job_id)
        return {"likes": likes, "reposts": reposts, "replies": {}, "last": last}

    def fetch_users_bulk(self, session, ids: list[str], job_id: str) -> list[dict]:
        """Cache-first hydration of explicit user ids (engager-seeded ingest)."""
        out, missing = [], []
        for uid in ids:
            cached = personas.get_cached_user(session, uid)
            # engager-endpoint stubs lack profile fields; only a full object is a hit
            if cached is not None and cached.get("created_at"):
                budget.record_cost(session, resource="user", count=1, job_id=job_id, dedup_hit=True)
                out.append(cached)
            else:
                missing.append(uid)
        if missing:
            budget.guard(session, resource="user", count=len(missing), soft_limit=self.soft_limit)
            fresh = self.api.get_users_bulk(missing)
            for u in fresh:
                personas.cache_user(session, str(u["id"]), u)
                out.append(u)
            budget.record_cost(session, resource="user", count=len(fresh), job_id=job_id)
        return out
