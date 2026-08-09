"""Audience-level aggregations for the MCP analysis tools.

Read-only. Composes the personas table (+ raw_users for the seed handle) and the
cluster store. Kept separate from clusters.py (owned by layer B) so the two
don't tangle. All queries scope by seed_account_id.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.store import clusters as cluster_store


def list_audiences(session: Session) -> list[dict]:
    """Ingested seed accounts: handle, id, persona counts, whether clusters exist.
    The discovery entry point — every other tool needs a seed_account_id."""
    rows = session.execute(text(
        "SELECT p.seed_account_id AS seed_account_id,"
        " count(*) AS personas,"
        " count(*) FILTER (WHERE p.enrichment_tier = 2) AS deep_personas,"
        " (SELECT count(*) FROM cluster_runs r"
        "    WHERE r.seed_account_id = p.seed_account_id AND r.status='active') AS active_runs,"
        " (SELECT u.data->>'username' FROM raw_users u"
        "    WHERE u.user_id = p.seed_account_id) AS seed_handle"
        " FROM personas p GROUP BY p.seed_account_id ORDER BY personas DESC"
    )).mappings().all()
    return [{
        "seed_account_id": r["seed_account_id"],
        "seed_handle": ("@" + r["seed_handle"]) if r["seed_handle"] else None,
        "personas": r["personas"],
        "deep_personas": r["deep_personas"],
        "has_clusters": bool(r["active_runs"]),
    } for r in rows]


def _tribe_brief(c: dict | None) -> dict | None:
    if not c:
        return None
    return {"cluster_id": c.get("cluster_id"), "label": c.get("label"),
            "size": c.get("size"), "engagement_index": c.get("engagement_index")}


def audience_overview(session: Session, seed_account_id: str) -> dict:
    """One-call brief: reach, tribe count, biggest tribe, most-engaged tribe."""
    total = session.execute(
        text("SELECT count(*) FROM personas WHERE seed_account_id=:s"),
        {"s": seed_account_id},
    ).scalar_one()
    if not total:
        return {"status": "not_found", "seed_account_id": seed_account_id}
    has_run = bool(cluster_store.active_run_id(session, seed_account_id))
    clusters = cluster_store.load_clusters(session, seed_account_id) if has_run else []
    biggest = max(clusters, key=lambda c: c.get("size") or 0, default=None)
    most_engaged = max(clusters, key=lambda c: c.get("engagement_index") or 0, default=None)
    return {
        "seed_account_id": seed_account_id,
        "personas": total,
        "clusters": len(clusters),
        "biggest_tribe": _tribe_brief(biggest),
        "most_engaged_tribe": _tribe_brief(most_engaged),
    }


def top_interests(session: Session, seed_account_id: str, k: int = 15) -> dict:
    """Most common persona-card interests across the audience — messaging signal."""
    rows = session.execute(text(
        "SELECT lower(trim(interest)) AS interest, count(*) AS n"
        " FROM personas p,"
        " jsonb_array_elements_text(p.doc->'persona_card'->'ranked_interests') AS interest"
        " WHERE p.seed_account_id = :s AND p.doc->'persona_card' IS NOT NULL"
        " GROUP BY lower(trim(interest)) ORDER BY n DESC, interest LIMIT :k"
    ), {"s": seed_account_id, "k": k}).mappings().all()
    return {
        "seed_account_id": seed_account_id,
        "top_interests": [{"interest": r["interest"], "count": r["n"]} for r in rows],
    }


def _member_summary(m: dict) -> dict:
    doc = m.get("doc") or {}
    card = doc.get("persona_card") or {}
    return {
        "user_id": m["user_id"],
        "handle": doc.get("handle"),
        "display_name": doc.get("display_name"),
        "bio": (doc.get("bio") or "")[:200],
        "followers_count": (doc.get("metrics") or {}).get("followers_count"),
        "one_liner": card.get("one_liner"),
        "ranked_interests": card.get("ranked_interests", []),
        "periphery": m.get("periphery"),
        "confidence": m.get("confidence"),
    }


def cluster_members(session: Session, seed_account_id: str, cluster_id: str,
                    k: int = 20) -> dict:
    """People in one tribe (active run), core members first then by confidence."""
    run = cluster_store.active_run_id(session, seed_account_id)
    if not run:
        return {"status": "no_active_run", "seed_account_id": seed_account_id, "members": []}
    members = cluster_store.members_with_profiles(session, run, cluster_id)
    ranked = sorted(
        members,
        key=lambda m: (bool(m.get("periphery")), -(m.get("confidence") or 0.0)),
    )
    return {
        "seed_account_id": seed_account_id,
        "cluster_id": cluster_id,
        "total_members": len(members),
        "members": [_member_summary(m) for m in ranked[:k]],
    }
