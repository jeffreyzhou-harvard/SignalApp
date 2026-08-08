from app.ingest import clean

def test_classify_repost_captures_referenced_user():
    raw = {
        "id": "5", "text": "RT ...", "created_at": "2026-08-05T00:00:00Z",
        "referenced_tweets": [{"type": "retweeted", "id": "9"}],
        "entities": {"mentions": [{"id": "77", "username": "karpathy"}], "hashtags": [{"tag": "evals"}]},
        "public_metrics": {"like_count": 3, "reply_count": 0, "retweet_count": 1, "bookmark_count": 0},
        "_referenced_user": {"id": "77", "handle": "@karpathy"},
    }
    post = clean.classify_post(raw)
    assert post.type == "repost"
    assert post.referenced_user.handle == "@karpathy"
    assert post.hashtags == ["evals"]

def test_context_annotations_frequency_weighted():
    raws = []
    for i in range(3):
        raws.append({"id": str(i), "text": "x", "created_at": "2026-08-05T00:00:00Z",
                     "public_metrics": {"like_count": 0, "reply_count": 0, "retweet_count": 0, "bookmark_count": 0},
                     "context_annotations": [{"domain": {"name": "Technology"}, "entity": {"name": "AI"}}]})
    content = clean.build_content(raws)
    ai = [c for c in content.context_annotations if c.entity == "AI"][0]
    assert ai.count == 3

def test_seed_engagement_aggregation():
    engagers = {"likes": {"u1"}, "reposts": {"u1"}, "replies": set(),
                "last": {"u1": "2026-08-06T00:00:00Z"}}
    se = clean.aggregate_seed_engagement("u1", engagers)
    assert se.likes_on_seed_posts == 1 and se.reposts == 1 and se.last_engaged_at == "2026-08-06T00:00:00Z"
