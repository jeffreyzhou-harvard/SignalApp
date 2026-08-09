"""Tests for cluster storage: schema invariants, the write/activate lifecycle,
and both associativity read paths (cluster -> profiles, user -> cluster).

Runs against the local docker Postgres (see conftest.py) — the partial unique
index and JSONB behavior need real Postgres, not sqlite.
"""
import json
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.store import clusters as cluster_store
from app.store import audience as audience_store
from app.store import db as dbm


@pytest.fixture()
def session():
    dbm.init_db()
    s = dbm.SessionLocal()
    yield s
    s.rollback()
    # tests create unique seed ids; sweep everything they made
    for t in ("cluster_members", "clusters", "cluster_runs"):
        s.execute(text(f"DELETE FROM {t} WHERE run_id LIKE 'test-%'"))
    s.execute(text("DELETE FROM personas WHERE user_id LIKE 'test-u%'"))
    s.commit()
    s.close()


def _seed() -> str:
    return f"seed-{uuid.uuid4().hex[:8]}"


def _mk_run(s, run_id: str, seed: str, status: str = "building", n_users: int = 4):
    s.execute(text(
        "INSERT INTO cluster_runs (run_id, seed_account_id, status, config)"
        " VALUES (:r, :s, :st, :cfg)"),
        {"r": run_id, "s": seed, "st": status, "cfg": json.dumps({"algo": "kmeans"})})
    s.execute(text(
        "INSERT INTO clusters (run_id, cluster_id, label, doc, size)"
        " VALUES (:r, '0', 'tribe-a', :d, :n1), (:r, '1', 'tribe-b', :d, :n2)"),
        {"r": run_id, "d": json.dumps({"keywords": ["k"]}),
         "n1": n_users - 1, "n2": 1})
    for i in range(n_users):
        cid = "0" if i < n_users - 1 else "1"
        s.execute(text(
            "INSERT INTO cluster_members (run_id, user_id, cluster_id, periphery, map_x, map_y)"
            " VALUES (:r, :u, :c, false, 0.1, 0.2)"),
            {"r": run_id, "u": f"test-u{i}", "c": cid})
    s.commit()


def _mk_personas(s, n: int = 4, seed: str = "seed-x"):
    for i in range(n):
        s.execute(text(
            "INSERT INTO personas (user_id, seed_account_id, relationship, enrichment_tier, doc, updated_at)"
            " VALUES (:u, :s, 'follower', 2, :d, now())"
            " ON CONFLICT (user_id) DO NOTHING"),
            {"u": f"test-u{i}", "s": seed,
             "d": json.dumps({"handle": f"@test{i}", "bio": f"bio {i}"})})
    s.commit()


def test_one_cluster_per_user_per_run(session):
    run, seed = f"test-{uuid.uuid4().hex[:8]}", _seed()
    _mk_run(session, run, seed)
    with pytest.raises(IntegrityError):
        session.execute(text(
            "INSERT INTO cluster_members (run_id, user_id, cluster_id)"
            " VALUES (:r, 'test-u0', '1')"), {"r": run})
        session.commit()


def test_only_one_active_run_per_seed(session):
    seed = _seed()
    r1, r2 = f"test-{uuid.uuid4().hex[:8]}", f"test-{uuid.uuid4().hex[:8]}"
    _mk_run(session, r1, seed, status="active")
    _mk_run(session, r2, seed, status="building")
    with pytest.raises(IntegrityError):
        session.execute(text(
            "UPDATE cluster_runs SET status='active' WHERE run_id=:r"), {"r": r2})
        session.commit()


def test_activate_swap_is_atomic(session):
    seed = _seed()
    r1, r2 = f"test-{uuid.uuid4().hex[:8]}", f"test-{uuid.uuid4().hex[:8]}"
    _mk_run(session, r1, seed, status="active")
    _mk_run(session, r2, seed, status="building")
    # the swap the ml layer performs (archive old + activate new, one txn)
    session.execute(text(
        "UPDATE cluster_runs SET status='archived'"
        " WHERE seed_account_id=:s AND status='active'"), {"s": seed})
    session.execute(text(
        "UPDATE cluster_runs SET status='active', activated_at=now()"
        " WHERE run_id=:r"), {"r": r2})
    session.commit()
    assert cluster_store.active_run_id(session, seed) == r2
    statuses = dict(session.execute(text(
        "SELECT run_id, status FROM cluster_runs WHERE seed_account_id=:s"),
        {"s": seed}).all())
    assert statuses == {r1: "archived", r2: "active"}


def test_cascade_delete_run_removes_children(session):
    run, seed = f"test-{uuid.uuid4().hex[:8]}", _seed()
    _mk_run(session, run, seed)
    session.execute(text("DELETE FROM cluster_runs WHERE run_id=:r"), {"r": run})
    session.commit()
    for t in ("clusters", "cluster_members"):
        n = session.execute(text(
            f"SELECT COUNT(*) FROM {t} WHERE run_id=:r"), {"r": run}).scalar()
        assert n == 0, f"{t} rows survived cascade"


def test_cluster_view_to_member_profiles(session):
    run, seed = f"test-{uuid.uuid4().hex[:8]}", _seed()
    _mk_personas(session, 4, seed)
    _mk_run(session, run, seed)
    rows = cluster_store.members_with_profiles(session, run, "0")
    assert len(rows) == 3
    assert all(r["doc"]["handle"].startswith("@test") for r in rows)
    assert {"map_x", "map_y", "periphery", "confidence"} <= set(rows[0])


def test_members_without_persona_rows_still_listed(session):
    """LEFT JOIN: membership must survive a missing persona row (partial states)."""
    run, seed = f"test-{uuid.uuid4().hex[:8]}", _seed()
    _mk_run(session, run, seed)  # no personas inserted at all
    rows = cluster_store.members_with_profiles(session, run, "0")
    assert len(rows) == 3
    assert all(r["doc"] is None for r in rows)


def test_user_search_to_cluster(session):
    run, seed = f"test-{uuid.uuid4().hex[:8]}", _seed()
    _mk_personas(session, 4, seed)
    _mk_run(session, run, seed, status="active")
    hit = cluster_store.cluster_for_user(session, "test-u0", seed)
    assert hit is not None and hit["label"] == "tribe-a"
    # user in no active run -> None, not an error
    assert cluster_store.cluster_for_user(session, "test-u0", "nonexistent-seed") is None


def test_load_clusters_falls_back_to_stub_without_active_run(session):
    out = cluster_store.load_clusters(session, "seed-with-no-runs")
    assert isinstance(out, list)  # stub fixtures, not an exception


def test_load_clusters_reads_active_run(session):
    run, seed = f"test-{uuid.uuid4().hex[:8]}", _seed()
    _mk_run(session, run, seed, status="active")
    out = cluster_store.load_clusters(session, seed)
    assert [c["label"] for c in out] == ["tribe-a", "tribe-b"]  # size DESC


def test_audience_snapshot_without_run_falls_back(session):
    out = audience_store.audience_snapshot(session, "seed-with-no-runs")
    assert out["run_id"] is None
    assert isinstance(out["clusters"], list) and out["members"] == []


def test_audience_snapshot_reads_active_run(session):
    run, seed = f"test-{uuid.uuid4().hex[:8]}", _seed()
    _mk_personas(session, 4, seed)
    _mk_run(session, run, seed, status="active")
    out = audience_store.audience_snapshot(session, seed)
    assert out["run_id"] == run and out["seed_account_id"] == seed
    assert [c["label"] for c in out["clusters"]] == ["tribe-a", "tribe-b"]
    assert len(out["members"]) == 4
    m = out["members"][0]
    assert {"user_id", "cluster_id", "map_x", "map_y", "doc"} <= set(m)
    assert m["doc"]["handle"].startswith("@test")


def test_audience_snapshot_defaults_to_latest_active_run(session):
    run, seed = f"test-{uuid.uuid4().hex[:8]}", _seed()
    _mk_run(session, run, seed, status="active")
    out = audience_store.audience_snapshot(session, None)
    # some active run exists now; the default path must resolve to one
    assert out["run_id"] is not None
    assert out["seed_account_id"] is not None
