from __future__ import annotations
from typing import Literal
from pydantic import BaseModel

Relationship = Literal["follower", "following", "seed_topic"]


class Metrics(BaseModel):
    followers_count: int
    following_count: int
    tweet_count: int
    listed_count: int


class SeedEngagement(BaseModel):
    likes_on_seed_posts: int = 0
    replies: int = 0
    reposts: int = 0
    last_engaged_at: str | None = None


class Mention(BaseModel):
    id: str
    handle: str


class RefUser(BaseModel):
    id: str
    handle: str


class EngagementBreakdown(BaseModel):
    like: float = 0
    reply: float = 0
    repost: float = 0
    bookmark: float = 0


class SamplePost(BaseModel):
    text: str
    type: Literal["original", "reply", "repost", "quote"]
    created_at: str
    mentions: list[Mention] = []
    hashtags: list[str] = []
    referenced_user: RefUser | None = None
    metrics: EngagementBreakdown = EngagementBreakdown()


class ContextAnnotation(BaseModel):
    domain: str
    entity: str
    count: int = 1


class Content(BaseModel):
    sample_posts: list[SamplePost] = []
    context_annotations: list[ContextAnnotation] = []
    avg_engagement: EngagementBreakdown = EngagementBreakdown()


class PersonaCard(BaseModel):
    archetype: str
    one_liner: str
    ranked_interests: list[str]
    preferred_formats: list[str]
    tone_affinity: str
    conversion_levers: list[str]
    summary: str


class Embedding(BaseModel):
    embedding_version: str
    model: str
    dim: int
    embed_input: str
    vector: list[float]


class PersonaDocument(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    seed_account_id: str
    relationship: Relationship = "follower"
    enrichment_tier: Literal[1, 2]
    # identity
    user_id: str
    handle: str
    display_name: str
    profile_url: str
    profile_image_url: str
    account_age_days: int
    verified: bool
    verified_type: str | None = None
    location: str | None = None
    url: str | None = None
    bio: str
    metrics: Metrics
    seed_engagement: SeedEngagement | None = None
    content: Content | None = None          # tier 2 only
    persona_card: PersonaCard | None = None  # tier 2 only
    embedding: Embedding | None = None       # B populates


class ProfileCard(BaseModel):
    user_id: str
    handle: str
    display_name: str
    profile_url: str
    profile_image_url: str
    bio: str
    verified: bool
    followers_count: int
    top_sample_post: SamplePost | None = None


class Cluster(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    seed_account_id: str
    cluster_id: str
    label: str
    persona_card: PersonaCard | None = None
    size: int
    share_of_audience: float
    engagement_index: float
    centroid: list[float] = []
    exemplars: list[ProfileCard] = []
    member_ids: list[str] = []
