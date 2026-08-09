"""Neon I/O for layer B: read personas, write versioned cluster runs, swap the
active pointer. Raw SQL against the schema owned by backend/app/store/db.py —
no backend import so the packages stay independent.
"""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import create_engine, text


def get_engine(env_path: str | Path = "../.env"):
    from dotenv import dotenv_values

    url = dotenv_values(env_path)["DATABASE_URL"]
    return create_engine(url.replace("postgres://", "postgresql://"))


def fetch_personas(engine, seed_account_id: str | None = None) -> list[dict]:
    q = "SELECT doc FROM personas"
    params = {}
    if seed_account_id:
        q += " WHERE seed_account_id = :seed"
        params["seed"] = seed_account_id
    with engine.connect() as c:
        rows = c.execute(text(q), params).scalars().all()
    return [json.loads(r) if isinstance(r, str) else r for r in rows]


def write_run(engine, cfg, aggregates, members, scores,
              seed_account_id: str, activate: bool = True) -> str:
    """Insert run + clusters + members in one transaction; optionally make it
    the active run (archiving the previous one atomically).

    `aggregates` and `members` come from `contracts` — the single source of the
    per-cluster stats and per-user membership, shared with the clusters.json
    emitter so the two contract sinks never drift.
    """
    with engine.begin() as c:
        c.execute(text(
            "INSERT INTO cluster_runs (run_id, seed_account_id, status, config, metrics)"
            " VALUES (:r, :s, 'building', :cfg, :m)"
        ), {"r": cfg.run_id, "s": seed_account_id,
            "cfg": json.dumps(cfg.to_row()), "m": json.dumps(scores.to_row())})

        for a in aggregates:
            c.execute(text(
                "INSERT INTO clusters (run_id, cluster_id, label, doc, size,"
                " share_of_audience, engagement_index, centroid)"
                " VALUES (:r, :c, :l, :d, :n, :sh, :e, :cen)"
            ), {"r": cfg.run_id, "c": a.cluster_id, "l": a.label,
                "d": json.dumps({"one_liner": a.one_liner, "keywords": a.keywords,
                                 "summary": a.summary}),
                "n": a.size, "sh": a.share_of_audience, "e": a.engagement_index,
                "cen": json.dumps(a.centroid)})

        c.execute(
            text("INSERT INTO cluster_members (run_id, user_id, cluster_id,"
                 " periphery, confidence, map_x, map_y)"
                 " VALUES (:r, :u, :c, :p, :conf, :x, :y)"),
            [{"r": cfg.run_id, "u": m.user_id, "c": m.cluster_id,
              "p": m.periphery, "conf": m.confidence, "x": m.x, "y": m.y}
             for m in members],
        )
        if activate:
            _activate_in_txn(c, cfg.run_id, seed_account_id)
    return cfg.run_id


def _activate_in_txn(c, run_id: str, seed_account_id: str) -> None:
    c.execute(text(
        "UPDATE cluster_runs SET status='archived'"
        " WHERE seed_account_id=:s AND status='active'"), {"s": seed_account_id})
    c.execute(text(
        "UPDATE cluster_runs SET status='active', activated_at=now()"
        " WHERE run_id=:r"), {"r": run_id})


def activate_run(engine, run_id: str, seed_account_id: str) -> None:
    with engine.begin() as c:
        _activate_in_txn(c, run_id, seed_account_id)


def write_vectors(engine, user_ids: list[str], vectors, model: str, dim: int,
                  embedding_version: str) -> int:
    """Backfill personas.vector so MCP/pgvector search works. Only call with
    vectors from the SAME space the backend embeds queries in (gemini-embedding-001,
    dim 1536, task CLUSTERING) — mixed spaces make search silently wrong.

    Also stamps doc.embedding metadata (model/dim/version, no vector copy) so
    provenance is inspectable from the persona document itself."""
    meta = json.dumps({"model": model, "dim": dim,
                       "embedding_version": embedding_version})
    rows = [
        {"u": uid, "v": "[" + ",".join(f"{float(x):.6f}" for x in vec) + "]",
         "meta": meta}
        for uid, vec in zip(user_ids, vectors)
    ]
    with engine.begin() as c:
        c.execute(text(
            "UPDATE personas SET vector = CAST(:v AS vector),"
            " doc = jsonb_set(doc, '{embedding}', CAST(:meta AS jsonb))"
            " WHERE user_id = :u"), rows)
    return len(rows)
