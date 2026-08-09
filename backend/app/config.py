from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )

    database_url: str = "postgresql+psycopg://agentsim:agentsim@localhost:5432/agentsim"
    # Grok key: accept either XAI_API_KEY (plan) or X_AI_API_KEY (actual .env convention)
    xai_api_key: str = Field(
        default="", validation_alias=AliasChoices("XAI_API_KEY", "X_AI_API_KEY")
    )
    x_bearer_token: str = Field(default="", validation_alias="X_AI_BEARER_TOKEN")
    # OAuth user context (either flavor) — unlocks liking_users/retweeted_by
    # (co-engagement) and posting. OAuth 2.0 user token from the app's
    # "Sign in with X" flow, OR the four OAuth 1.0a credentials from the portal.
    x_user_access_token: str = Field(default="", validation_alias="X_USER_ACCESS_TOKEN")
    x_consumer_key: str = Field(default="", validation_alias="X_AI_CONSUMER_KEY")
    x_consumer_secret: str = Field(default="", validation_alias="X_AI_SECRET_KEY")
    x_oauth1_access_token: str = Field(default="", validation_alias="X_OAUTH1_ACCESS_TOKEN")
    x_oauth1_access_secret: str = Field(default="", validation_alias="X_OAUTH1_ACCESS_SECRET")

    # Budget guard (USD)
    x_api_budget_usd: float = 250.0
    x_api_spend_soft_limit_usd: float = 200.0

    # Grok summarization client — model id is billing-sensitive (retired ids overbill),
    # so it is config, never inline. Only grok-4.3 is sanctioned for v1.
    grok_model: str = "grok-4.3"
    grok_base_url: str = "https://api.x.ai/v1"
    grok_max_retries: int = 2

    # API throttling / robustness
    http_timeout_s: float = 30.0          # per-request timeout for the Grok client
    worker_poll_interval_s: float = 1.0   # background worker job-claim poll cadence
    followers_page_size: int = 1000       # X followers page size (max 1000)
    seed_posts_lookback: int = 25         # recent seed posts scanned for co-engagement
    enrich_concurrency: int = 8           # parallel Grok persona-card calls during tier-2 enrich

    # MCP transport: DNS-rebinding protection stays ON. localhost is always
    # trusted; add public hosts (e.g. a cloudflare tunnel domain) here to let
    # xAI's server-side executor reach us. Comma-separated, exact hosts. Empty
    # default = localhost-only (unchanged, secure).
    mcp_allowed_hosts: str = ""

    # Embedding space — MUST match Layer B (ml/agentsim_ml/embed.py) so query and
    # stored persona vectors live in one space. Config-driven; never inline.
    embedding_model: str = "gemini-embedding-001"
    embedding_dim: int = 1536
    embedding_task_type: str = "CLUSTERING"   # match B's document embeddings
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
    embedding_cache_size: int = 512           # in-process LRU for query embeddings


settings = Settings()
