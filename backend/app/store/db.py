from datetime import datetime, timezone
from sqlalchemy import (
    create_engine, String, Integer, Float, Boolean, DateTime,
    ForeignKey, ForeignKeyConstraint, Index, text,
)
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


class ClusterRunRow(Base):
    """One immutable clustering run (lifecycle versioning unit). Exactly one
    'active' run per seed account, enforced by a partial unique index; swap =
    archive old + activate new in one transaction (see ml layer's activate_run)."""

    __tablename__ = "cluster_runs"
    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    seed_account_id: Mapped[str] = mapped_column(String, index=True)
    # server_default (not ORM default): these tables are written via raw SQL from
    # the ml layer, which bypasses Python-side defaults entirely
    status: Mapped[str] = mapped_column(String, server_default=text("'building'"))
    config: Mapped[dict] = mapped_column(JSONB)   # composition, embedder+version, algo+params
    metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index(
            "one_active_run_per_seed", "seed_account_id",
            unique=True, postgresql_where=text("status = 'active'"),
        ),
    )


class ClusterRow(Base):
    """Cluster metadata per run. Profile data lives ONLY in personas; the doc
    holds label/keywords/persona_card/exemplar ids, never member profiles."""

    __tablename__ = "clusters"
    run_id: Mapped[str] = mapped_column(
        ForeignKey("cluster_runs.run_id", ondelete="CASCADE"), primary_key=True
    )
    cluster_id: Mapped[str] = mapped_column(String, primary_key=True)
    label: Mapped[str] = mapped_column(String)
    doc: Mapped[dict] = mapped_column(JSONB)
    size: Mapped[int] = mapped_column(Integer)
    share_of_audience: Mapped[float | None] = mapped_column(Float, nullable=True)
    engagement_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    centroid: Mapped[list | None] = mapped_column(JSONB, nullable=True)


class ClusterMemberRow(Base):
    """The associativity table. PK (run_id, user_id) encodes the invariant:
    one cluster per user per run, no orphans. Indexed both directions —
    cluster→users and user→cluster are each one indexed query."""

    __tablename__ = "cluster_members"
    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, primary_key=True)  # → personas.user_id
    cluster_id: Mapped[str] = mapped_column(String)
    periphery: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))  # HDBSCAN noise flag
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)  # tier-1 assignment ratio
    map_x: Mapped[float | None] = mapped_column(Float, nullable=True)  # display-projection coords
    map_y: Mapped[float | None] = mapped_column(Float, nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["run_id", "cluster_id"],
            ["clusters.run_id", "clusters.cluster_id"],
            ondelete="CASCADE",
        ),
        Index("members_by_cluster", "run_id", "cluster_id"),
        Index("members_by_user", "user_id"),
    )


def init_db() -> None:
    """Single source of truth for the DB schema.

    The SQLAlchemy ORM models above ARE the schema — there is no hand-maintained
    SQL file to drift from them. Apply/refresh the schema only through this function
    (idempotent): via the CLI (`python -m app.store.db` or `scripts/init_db.py`) or
    the FastAPI startup hook. Never run DDL manually against the database.
    """
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(engine)


if __name__ == "__main__":  # `uv run python -m app.store.db`
    init_db()
    from sqlalchemy import inspect

    print("schema applied. tables:", sorted(inspect(engine).get_table_names()))
