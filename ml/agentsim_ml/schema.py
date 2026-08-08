"""PersonaDocument: tolerant parser for Sam's ingest schema (v1.0 + agreed asks).

Tier 1 users have bio/metrics only; content, persona_card and embedding are
nullable. Never assume deep fields exist — go through the helpers.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Post:
    text: str
    type: str = "original"
    mentions: list[str] = field(default_factory=list)
    referenced_user: str | None = None


@dataclass
class PersonaDocument:
    user_id: str
    handle: str
    bio: str = ""
    display_name: str = ""
    enrichment_tier: int = 1
    followers_count: int = 0
    seed_account_id: str = ""
    profile_url: str = ""
    profile_image_url: str = ""
    verified: bool = False
    avg_engagement: float = 0.0  # sum of per-post avg like/reply/repost/bookmark
    posts: list[Post] = field(default_factory=list)
    annotations: list[str] = field(default_factory=list)  # "domain/entity" strings
    persona_card: dict[str, Any] | None = None
    seed_engagement: dict[str, Any] | None = None
    cluster_id: int | None = None  # populated by us, never by ingest

    @property
    def is_deep(self) -> bool:
        return self.enrichment_tier == 2

    @classmethod
    def from_ingest(cls, raw: dict[str, Any]) -> "PersonaDocument":
        content = raw.get("content") or {}
        def _handle(m) -> str:
            return m.get("handle", "") if isinstance(m, dict) else str(m)

        posts = [
            Post(
                text=p.get("text", ""),
                type=p.get("type", "original"),
                mentions=[h for h in (_handle(m) for m in p.get("mentions", [])) if h],
                referenced_user=_handle(p["referenced_user"]) if p.get("referenced_user") else None,
            )
            for p in content.get("sample_posts", [])
        ]
        # annotations repeated by their count so TF-IDF sees frequency weighting
        annotations = [
            f"{a.get('domain', '')}/{a.get('entity', '')}"
            for a in content.get("context_annotations", [])
            for _ in range(max(1, int(a.get("count", 1))))
        ]
        tier = raw.get("enrichment_tier") or (2 if posts else 1)
        avg = content.get("avg_engagement") or {}
        return cls(
            user_id=str(raw["user_id"]),
            handle=raw.get("handle", ""),
            bio=raw.get("bio", "") or "",
            display_name=raw.get("display_name", ""),
            enrichment_tier=tier,
            followers_count=(raw.get("metrics") or {}).get("followers_count", 0),
            seed_account_id=raw.get("seed_account_id", ""),
            profile_url=raw.get("profile_url", ""),
            profile_image_url=raw.get("profile_image_url", ""),
            verified=bool(raw.get("verified", False)),
            avg_engagement=float(sum(avg.get(k, 0) for k in ("like", "reply", "repost", "bookmark"))),
            posts=posts,
            annotations=annotations,
            persona_card=raw.get("persona_card"),
            seed_engagement=raw.get("seed_engagement"),
        )
