from pydantic import BaseModel


class LedgerEntry(BaseModel):
    id: str
    job_id: str | None = None
    provider: str  # "x" | "xai"
    resource: str  # followers | user | post | grok_card | ...
    count: int
    unit_cost_usd: float
    total_usd: float
    dedup_hit: bool = False
    created_at: str
