"""Read path for cluster data — the real replacement for clusters_stub.

Both click-through directions are one indexed query each:
  - cluster view -> member profiles: members_with_profiles()
  - user search  -> their tribe:     cluster_for_user()
Falls back to the fixtures stub when no active run exists yet.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.store import clusters_stub


def active_run_id(session: Session, seed_account_id: str) -> str | None:
    return session.execute(
        text("SELECT run_id FROM cluster_runs"
             " WHERE seed_account_id=:s AND status='active'"),
        {"s": seed_account_id},
    ).scalar()


def load_clusters(session: Session, seed_account_id: str | None = None) -> list[dict]:
    """Cluster list for the active run; stub fixtures if none exists yet."""
    run = seed_account_id and active_run_id(session, seed_account_id)
    if not run:
        return clusters_stub.load_clusters()
    rows = session.execute(
        text("SELECT run_id, cluster_id, label, doc, size, share_of_audience,"
             " engagement_index FROM clusters WHERE run_id=:r ORDER BY size DESC"),
        {"r": run},
    ).mappings().all()
    return [dict(r) for r in rows]


def members_with_profiles(session: Session, run_id: str, cluster_id: str) -> list[dict]:
    """Cluster view -> click a member -> full profile (personas.doc)."""
    rows = session.execute(
        text("SELECT m.user_id, m.periphery, m.confidence, m.map_x, m.map_y, p.doc"
             " FROM cluster_members m LEFT JOIN personas p ON p.user_id = m.user_id"
             " WHERE m.run_id=:r AND m.cluster_id=:c"),
        {"r": run_id, "c": cluster_id},
    ).mappings().all()
    return [dict(r) for r in rows]


def cluster_for_user(session: Session, user_id: str, seed_account_id: str) -> dict | None:
    """User search -> which tribe they're in (active run)."""
    row = session.execute(
        text("SELECT c.run_id, c.cluster_id, c.label, c.doc, m.periphery, m.confidence"
             " FROM cluster_members m"
             " JOIN clusters c ON c.run_id = m.run_id AND c.cluster_id = m.cluster_id"
             " JOIN cluster_runs r ON r.run_id = m.run_id AND r.status='active'"
             " WHERE m.user_id=:u AND r.seed_account_id=:s"),
        {"u": user_id, "s": seed_account_id},
    ).mappings().first()
    return dict(row) if row else None
