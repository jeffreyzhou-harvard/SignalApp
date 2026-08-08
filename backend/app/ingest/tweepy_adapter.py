"""Real tweepy-backed adapter for the X API v2.

`make_api()` returns an object whose methods return PLAIN DICTS in exactly the
shape that `app/ingest/x_client.py` and `app/ingest/clean.py` consume. It wraps
`tweepy.Client`. `make_grok()` returns an OpenAI client pointed at x.ai (or None
when no key is configured).
"""
from __future__ import annotations

import tweepy

from app.config import settings

_USER_FIELDS = [
    "created_at",
    "description",
    "entities",
    "location",
    "url",
    "verified",
    "verified_type",
    "profile_image_url",
    "public_metrics",
]

_TWEET_FIELDS = [
    "text",
    "public_metrics",
    "entities",
    "context_annotations",
    "created_at",
    "referenced_tweets",
]

_TWEET_EXPANSIONS = ["referenced_tweets.id", "referenced_tweets.id.author_id"]


def _as_dict(obj):
    """Return the plain-dict payload of a tweepy object (or the object itself)."""
    if obj is None:
        return None
    data = getattr(obj, "data", None)
    if isinstance(data, dict):
        return data
    if isinstance(obj, dict):
        return obj
    return data


class TweepyAPI:
    def __init__(self, client: "tweepy.Client"):
        self.client = client

    # -- users -----------------------------------------------------------
    def get_user(self, handle_or_id) -> dict | None:
        raw = str(handle_or_id).strip()
        if raw.startswith("@"):
            raw = raw[1:]
        if raw.isdigit():
            resp = self.client.get_user(id=raw, user_fields=_USER_FIELDS)
        else:
            resp = self.client.get_user(username=raw, user_fields=_USER_FIELDS)
        return _as_dict(resp.data) if resp is not None else None

    def get_users_followers(self, seed_id, max_followers: int = 1000):
        """Generator yielding PAGES (each a list of plain user dicts)."""
        paginator = tweepy.Paginator(
            self.client.get_users_followers,
            id=seed_id,
            user_fields=_USER_FIELDS,
            max_results=settings.followers_page_size,
        )
        for page in paginator:
            users = page.data or []
            yield [u.data for u in users]

    # -- tweets ----------------------------------------------------------
    def get_users_tweets(self, user_id, max_results: int = 10) -> list[dict]:
        resp = self.client.get_users_tweets(
            user_id,
            max_results=max_results,
            tweet_fields=_TWEET_FIELDS,
            expansions=_TWEET_EXPANSIONS,
        )
        tweets = resp.data or []
        if not tweets:
            return []

        includes = getattr(resp, "includes", None) or {}
        inc_users = includes.get("users") or []
        inc_tweets = includes.get("tweets") or []
        users_by_id = {str(u.id): u for u in inc_users}
        tweets_by_id = {str(t.id): t for t in inc_tweets}

        out = []
        for t in tweets:
            td = dict(t.data)
            td["_referenced_user"] = self._referenced_user(td, tweets_by_id, users_by_id)
            out.append(td)
        return out

    @staticmethod
    def _referenced_user(tweet_dict, tweets_by_id, users_by_id):
        refs = tweet_dict.get("referenced_tweets") or []
        for ref in refs:
            ref_id = str(ref.get("id"))
            ref_tweet = tweets_by_id.get(ref_id)
            author_id = None
            if ref_tweet is not None:
                author_id = str(getattr(ref_tweet, "author_id", None) or "")
            if author_id and author_id in users_by_id:
                author = users_by_id[author_id]
                return {"id": str(author.id), "handle": "@" + author.username}
        return None

    def get_recent_seed_posts(self, seed_id) -> list[str]:
        resp = self.client.get_users_tweets(seed_id, max_results=settings.seed_posts_lookback)
        return [str(t.id) for t in (resp.data or [])]

    # -- engagement ------------------------------------------------------
    def get_liking_users(self, post_id) -> list[dict]:
        resp = self.client.get_liking_users(post_id)
        return [u.data for u in (resp.data or [])]

    def get_retweeters(self, post_id) -> list[dict]:
        resp = self.client.get_retweeters(post_id)
        return [u.data for u in (resp.data or [])]


def make_api() -> TweepyAPI:
    client = tweepy.Client(
        bearer_token=settings.x_bearer_token,
        wait_on_rate_limit=True,
    )
    return TweepyAPI(client)


def make_grok():
    if not settings.xai_api_key:
        return None
    import openai

    return openai.OpenAI(
        base_url=settings.grok_base_url,
        api_key=settings.xai_api_key,
        timeout=settings.http_timeout_s,
        max_retries=settings.grok_max_retries,
    )
