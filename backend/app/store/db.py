from datetime import datetime, timezone
from sqlalchemy import create_engine, String, Integer, Float, Boolean, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector
from app.config import settings

engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, future=True, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RawUserRow(Base):
    __tablename__ = "raw_users"
    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    data: Mapped[dict] = mapped_column(JSONB)


class RawTweetRow(Base):
    __tablename__ = "raw_tweets"
    tweet_id: Mapped[str] = mapped_column(String, primary_key=True)
    author_id: Mapped[str] = mapped_column(String, index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    data: Mapped[dict] = mapped_column(JSONB)


class PersonaRow(Base):
    __tablename__ = "personas"
    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    seed_account_id: Mapped[str] = mapped_column(String, index=True)
    relationship: Mapped[str] = mapped_column(String, default="follower")
    enrichment_tier: Mapped[int] = mapped_column(Integer, default=1)
    doc: Mapped[dict] = mapped_column(JSONB)
    # Dimensionless Vector — Layer B sets the actual embedding dimension later
    vector = mapped_column(Vector(), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class JobRow(Base):
    __tablename__ = "jobs"
    job_id: Mapped[str] = mapped_column(String, primary_key=True)
    doc: Mapped[dict] = mapped_column(JSONB)  # serialized IngestJob
    status: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class LedgerRow(Base):
    __tablename__ = "cost_ledger"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    job_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String)
    resource: Mapped[str] = mapped_column(String)
    count: Mapped[int] = mapped_column(Integer)
    unit_cost_usd: Mapped[float] = mapped_column(Float)
    total_usd: Mapped[float] = mapped_column(Float)
    dedup_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


def init_db() -> None:
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(engine)
