"""Neon I/O for layer B: read personas, write versioned cluster runs, swap the
active pointer. Raw SQL against the schema owned by backend/app/store/db.py —
no backend import so the packages stay independent.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
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


def write_run(engine, cfg, docs, result, cluster_labels, coords: np.ndarray,
              scores, seed_account_id: str, activate: bool = True) -> str:
    """Insert run + clusters + members in one transaction; optionally make it
    the active run (archiving the previous one atomically)."""
    by_id = {cl.cluster_id: cl for cl in cluster_labels}
    pop_eng = np.mean([d.avg_engagement for d in docs]) or 1.0
    with engine.begin() as c:
        c.execute(text(
            "INSERT INTO cluster_runs (run_id, seed_account_id, status, config, metrics)"
            " VALUES (:r, :s, 'building', :cfg, :m)"
        ), {"r": cfg.run_id, "s": seed_account_id,
            "cfg": json.dumps(cfg.to_row()), "m": json.dumps(scores.to_row())})

        for cid in np.unique(result.labels):
            m = result.labels == cid
            idx = np.where(m)[0]
            cl = by_id.get(int(cid))
            eng = float((np.mean([docs[i].avg_engagement for i in idx]) or 0.0) / pop_eng)
            c.execute(text(
                "INSERT INTO clusters (run_id, cluster_id, label, doc, size,"
                " share_of_audience, engagement_index, centroid)"
                " VALUES (:r, :c, :l, :d, :n, :sh, :e, :cen)"
            ), {"r": cfg.run_id, "c": str(int(cid)),
                "l": cl.name if cl else str(cid),
                "d": json.dumps({"one_liner": cl.one_liner if cl else "",
                                 "keywords": cl.keywords if cl else []}),
                "n": int(m.sum()), "sh": float(m.mean()), "e": round(eng, 3),
                "cen": json.dumps([round(float(v), 5) for v in result.centroids[int(cid)]])})

        c.execute(
            text("INSERT INTO cluster_members (run_id, user_id, cluster_id,"
                 " periphery, map_x, map_y)"
                 " VALUES (:r, :u, :c, :p, :x, :y)"),
            [{"r": cfg.run_id, "u": d.user_id, "c": str(int(result.labels[i])),
              "p": bool(result.was_noise[i]),
              "x": float(coords[i, 0]), "y": float(coords[i, 1])}
             for i, d in enumerate(docs)],
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
