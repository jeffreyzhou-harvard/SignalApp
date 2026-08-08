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
        likes, reposts, last = set(), set(), {}
        for pid in post_ids:
            for u in self.api.get_liking_users(pid) or []:
                likes.add(str(u["id"])); last[str(u["id"])] = u.get("_engaged_at", "")
                budget.record_cost(session, resource="engager", count=1, job_id=job_id)
            for u in self.api.get_retweeters(pid) or []:
                reposts.add(str(u["id"])); last[str(u["id"])] = u.get("_engaged_at", "")
                budget.record_cost(session, resource="engager", count=1, job_id=job_id)
        return {"likes": likes, "reposts": reposts, "replies": set(), "last": last}
