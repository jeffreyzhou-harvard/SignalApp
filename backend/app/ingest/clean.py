from collections import Counter
from datetime import datetime
from app.models.persona import (
    SamplePost,
    Content,
    ContextAnnotation,
    EngagementBreakdown,
    SeedEngagement,
    Mention,
    RefUser,
    Metrics,
)

_REF_TYPE = {"retweeted": "repost", "quoted": "quote", "replied_to": "reply"}


def account_age_days(created_at: str, now_iso: str) -> int:
    a = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    b = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
    return max(0, (b - a).days)


def classify_post(raw: dict) -> SamplePost:
    refs = raw.get("referenced_tweets") or []
    ptype = "original"
    for r in refs:
        if r["type"] in _REF_TYPE:
            ptype = _REF_TYPE[r["type"]]
            break
    ents = raw.get("entities") or {}
    mentions = [
        Mention(id=str(m.get("id", "")), handle="@" + m["username"])
        for m in ents.get("mentions", [])
        if m.get("username")
    ]
    hashtags = [h["tag"] for h in ents.get("hashtags", [])]
    ru = raw.get("_referenced_user")
    referenced_user = RefUser(**ru) if ru else None
    pm = raw.get("public_metrics", {})
    return SamplePost(
        text=raw.get("text", ""),
        type=ptype,
        created_at=raw["created_at"],
        mentions=mentions,
        hashtags=hashtags,
        referenced_user=referenced_user,
        metrics=EngagementBreakdown(
            like=pm.get("like_count", 0),
            reply=pm.get("reply_count", 0),
            repost=pm.get("retweet_count", 0),
            bookmark=pm.get("bookmark_count", 0),
        ),
    )


def build_content(raw_tweets: list[dict]) -> Content:
    posts = [classify_post(t) for t in raw_tweets]
    ann: Counter = Counter()
    for t in raw_tweets:
        for ca in t.get("context_annotations") or []:
            ann[(ca["domain"]["name"], ca["entity"]["name"])] += 1
    annotations = [
        ContextAnnotation(domain=d, entity=e, count=c) for (d, e), c in ann.items()
    ]
    n = max(1, len(posts))
    avg = EngagementBreakdown(
        like=sum(p.metrics.like for p in posts) / n,
        reply=sum(p.metrics.reply for p in posts) / n,
        repost=sum(p.metrics.repost for p in posts) / n,
        bookmark=sum(p.metrics.bookmark for p in posts) / n,
    )
    return Content(
        sample_posts=posts, context_annotations=annotations, avg_engagement=avg
    )


def aggregate_seed_engagement(user_id: str, engagers: dict) -> SeedEngagement:
    return SeedEngagement(
        likes_on_seed_posts=1 if user_id in engagers["likes"] else 0,
        reposts=1 if user_id in engagers["reposts"] else 0,
        replies=1 if user_id in engagers["replies"] else 0,
        last_engaged_at=engagers["last"].get(user_id),
    )


def build_identity(
    raw_user: dict, seed_account_id: str, tier: int, now_iso: str
) -> dict:
    pm = raw_user.get("public_metrics", {})
    return dict(
        seed_account_id=seed_account_id,
        enrichment_tier=tier,
        user_id=str(raw_user["id"]),
        handle="@" + raw_user["username"],
        display_name=raw_user.get("name", ""),
        profile_url=f"https://x.com/{raw_user['username']}",
        profile_image_url=raw_user.get("profile_image_url", ""),
        account_age_days=account_age_days(raw_user["created_at"], now_iso),
        verified=raw_user.get("verified", False),
        verified_type=raw_user.get("verified_type"),
        location=raw_user.get("location"),
        url=raw_user.get("url"),
        bio=raw_user.get("description", ""),
        metrics=Metrics(
            followers_count=pm.get("followers_count", 0),
            following_count=pm.get("following_count", 0),
            tweet_count=pm.get("tweet_count", 0),
            listed_count=pm.get("listed_count", 0),
        ),
    )
