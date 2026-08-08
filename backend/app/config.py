from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )

    database_url: str = "postgresql+psycopg://agentsim:agentsim@localhost:5432/agentsim"
    xai_api_key: str = Field(default="", validation_alias="XAI_API_KEY")
    x_bearer_token: str = Field(default="", validation_alias="X_AI_BEARER_TOKEN")
    x_api_budget_usd: float = 250.0
    x_api_spend_soft_limit_usd: float = 200.0


settings = Settings()
