"""Offline unit test for the real tweepy adapter.

Stubs tweepy.Client so no live X call is ever made, and asserts the adapter
returns PLAIN DICTS in the exact shape x_client / clean consume.
"""
import types

from app.ingest import tweepy_adapter


class _Obj:
    """Minimal stand-in for a tweepy object: attribute access + .data dict."""
    def __init__(self, data):
        self.data = data
        for k, v in data.items():
            setattr(self, k, v)


class _Resp:
    def __init__(self, data, includes=None):
        self.data = data
        self.includes = includes or {}


class StubClient:
    def __init__(self, **kw):
        self.kw = kw

    def get_user(self, id=None, username=None, **kw):
        return _Resp(_Obj({
            "id": "42", "username": "seed", "name": "Seed",
            "description": "bio", "created_at": "2020-01-01T00:00:00.000Z",
            "verified": True, "verified_type": "blue",
            "location": "SF", "url": "https://x.com/seed",
            "profile_image_url": "http://img",
            "public_metrics": {"followers_count": 10, "following_count": 5,
                               "tweet_count": 3, "listed_count": 1},
        }))

    def get_users_followers(self, id=None, **kw):
        return _Resp([
            _Obj({"id": "1", "username": "f1", "name": "F1",
                  "public_metrics": {"followers_count": 1, "following_count": 1,
                                     "tweet_count": 1, "listed_count": 0},
                  "created_at": "2021-01-01T00:00:00.000Z"}),
        ])

    def get_users_tweets(self, user_id, **kw):
        tweet = _Obj({
            "id": "100", "text": "hi @bob", "created_at": "2026-08-05T00:00:00.000Z",
            "public_metrics": {"like_count": 2, "reply_count": 0, "retweet_count": 1,
                               "quote_count": 0, "bookmark_count": 0},
            "entities": {"mentions": [{"username": "bob", "id": "7"}]},
            "context_annotations": [],
            "referenced_tweets": [{"type": "retweeted", "id": "200"}],
        })
        includes = {
            "tweets": [_Obj({"id": "200", "author_id": "7", "text": "orig"})],
            "users": [_Obj({"id": "7", "username": "bob"})],
        }
        return _Resp([tweet], includes=includes)

    def get_liking_users(self, post_id, **kw):
        return _Resp([_Obj({"id": "9", "username": "liker"})])

    def get_retweeters(self, post_id, **kw):
        return _Resp([_Obj({"id": "11", "username": "rt"})])


def _make(monkeypatch):
    monkeypatch.setattr(tweepy_adapter.tweepy, "Client", StubClient)
    return tweepy_adapter.make_api()


def test_get_user_returns_plain_dict(monkeypatch):
    api = _make(monkeypatch)
    u = api.get_user("@seed")
    assert isinstance(u, dict)
    assert u["id"] == "42" and u["username"] == "seed"
    assert u["public_metrics"]["followers_count"] == 10


def test_get_user_numeric_id(monkeypatch):
    api = _make(monkeypatch)
    u = api.get_user("42")
    assert u["id"] == "42"


def test_followers_yields_pages_of_dicts(monkeypatch):
    # Paginator over a stub: patch tweepy.Paginator to just yield one response.
    monkeypatch.setattr(tweepy_adapter.tweepy, "Client", StubClient)

    def fake_paginator(method, **kw):
        yield method(**kw)

    monkeypatch.setattr(tweepy_adapter.tweepy, "Paginator", fake_paginator)
    api = tweepy_adapter.make_api()
    pages = list(api.get_users_followers("42", max_followers=10))
    assert len(pages) == 1
    assert isinstance(pages[0][0], dict)
    assert pages[0][0]["id"] == "1"


def test_get_users_tweets_shape_and_referenced_user(monkeypatch):
    api = _make(monkeypatch)
    tweets = api.get_users_tweets("42", max_results=5)
    assert isinstance(tweets, list) and isinstance(tweets[0], dict)
    t = tweets[0]
    assert t["id"] == "100"
    assert t["public_metrics"]["like_count"] == 2
    assert t["_referenced_user"] == {"id": "7", "handle": "@bob"}


def test_recent_seed_posts_are_strings(monkeypatch):
    api = _make(monkeypatch)
    ids = api.get_recent_seed_posts("42")
    assert ids == ["100"]


def test_liking_and_retweeters(monkeypatch):
    api = _make(monkeypatch)
    assert api.get_liking_users("100")[0]["id"] == "9"
    assert api.get_retweeters("100")[0]["id"] == "11"


def test_make_grok_none_when_no_key(monkeypatch):
    monkeypatch.setattr(tweepy_adapter.settings, "xai_api_key", "")
    assert tweepy_adapter.make_grok() is None
