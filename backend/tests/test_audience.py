"""Tests for audience aggregations (list_audiences, overview, top_interests,
cluster_members). Runs against local Postgres (see conftest.py) — needs real
JSONB + the cluster tables, not sqlite."""
import json
import uuid

import pytest
from sqlalchemy import text

from app.store import audience, db, personas
from app.models.persona import PersonaCard, PersonaDocument


@pytest.fixture()
def session():
    db.init_db()
    s = db.SessionLocal()
    yield s
    s.rollback()
    s.execute(text("DELETE FROM cluster_members WHERE run_id LIKE 'test-%'"))
    s.execute(text("DELETE FROM clusters WHERE run_id LIKE 'test-%'"))
    s.execute(text("DELETE FROM cluster_runs WHERE run_id LIKE 'test-%'"))
    s.execute(text("DELETE FROM personas WHERE user_id LIKE 'test-u%'"))
    s.execute(text("DELETE FROM raw_users WHERE user_id LIKE 'test-seed%'"))
    s.commit()
    s.close()


def _seed() -> str:
    return f"test-seed-{uuid.uuid4().hex[:8]}"


def _persona(s, uid, seed, interests, tier=2):
    card = None
    if tier == 2:
        card = PersonaCard(archetype="a", one_liner=f"Into {interests[0]}",
            ranked_interests=interests, preferred_formats=["threads"],
            tone_affinity="neutral", conversion_levers=["value"], summary="s")
    d = PersonaDocument(
        seed_account_id=seed, relationship="follower", enrichment_tier=tier,
        user_id=uid, handle="@" + uid, display_name=uid.title(),
        profile_url="http://x", profile_image_url="http://i", account_age_days=1,
        verified=False, bio=f"bio about {interests[0]}",
        metrics={"followers_count": 10, "following_count": 1, "tweet_count": 1, "listed_count": 0},
        persona_card=card)
    personas.upsert_persona(s, d)


def _raw_seed(s, seed, username):
    s.execute(text("INSERT INTO raw_users (user_id, fetched_at, data)"
                   " VALUES (:u, now(), CAST(:d AS jsonb))"
                   " ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data"),
              {"u": seed, "d": json.dumps({"username": username})})


def _run(s, run_id, seed, status="active"):
    s.execute(text("INSERT INTO cluster_runs (run_id, seed_account_id, status, config)"
                   " VALUES (:r, :s, :st, CAST(:c AS jsonb))"),
              {"r": run_id, "s": seed, "st": status, "c": json.dumps({"algo": "kmeans"})})


def _cluster(s, run_id, cid, label, size, eng):
    s.execute(text("INSERT INTO clusters (run_id, cluster_id, label, doc, size,"
                   " share_of_audience, engagement_index)"
                   " VALUES (:r, :c, :l, CAST(:d AS jsonb), :n, :sh, :e)"),
              {"r": run_id, "c": cid, "l": label,
               "d": json.dumps({"one_liner": label, "keywords": []}),
               "n": size, "sh": 0.5, "e": eng})


def _member(s, run_id, uid, cid, periphery=False, conf=0.9):
    s.execute(text("INSERT INTO cluster_members (run_id, user_id, cluster_id, periphery, confidence)"
                   " VALUES (:r, :u, :c, :p, :conf)"),
              {"r": run_id, "u": uid, "c": cid, "p": periphery, "conf": conf})


def test_list_audiences(session):
    seed = _seed()
    _raw_seed(session, seed, "acme")
    _persona(session, "test-u1", seed, ["ai"], tier=2)
    _persona(session, "test-u2", seed, ["ai"], tier=2)
    _persona(session, "test-u3", seed, ["design"], tier=1)
    session.commit()
    got = {a["seed_account_id"]: a for a in audience.list_audiences(session)}
    a = got[seed]
    assert a["seed_handle"] == "@acme"
    assert a["personas"] == 3 and a["deep_personas"] == 2
    assert a["has_clusters"] is False


def test_top_interests_counts_and_orders(session):
    seed = _seed()
    _persona(session, "test-u1", seed, ["AI", "robotics"])
    _persona(session, "test-u2", seed, ["ai", "design"])   # 'AI'/'ai' collapse (lowercased)
    _persona(session, "test-u3", seed, ["ai"])
    session.commit()
    out = audience.top_interests(session, seed, k=10)
    counts = {r["interest"]: r["count"] for r in out["top_interests"]}
    assert counts["ai"] == 3
    assert out["top_interests"][0]["interest"] == "ai"   # most common first


def test_audience_overview_picks_biggest_and_most_engaged(session):
    seed = _seed()
    _persona(session, "test-u1", seed, ["ai"])
    run = f"test-{uuid.uuid4().hex[:6]}"
    _run(session, run, seed, status="active")
    _cluster(session, run, "c0", "Big tribe", size=50, eng=0.2)
    _cluster(session, run, "c1", "Hot tribe", size=10, eng=0.9)
    session.commit()
    ov = audience.audience_overview(session, seed)
    assert ov["personas"] == 1 and ov["clusters"] == 2
    assert ov["biggest_tribe"]["cluster_id"] == "c0"
    assert ov["most_engaged_tribe"]["cluster_id"] == "c1"


def test_audience_overview_unknown_seed(session):
    assert audience.audience_overview(session, "test-seed-none")["status"] == "not_found"


def test_cluster_members_ranks_core_before_periphery(session):
    seed = _seed()
    run = f"test-{uuid.uuid4().hex[:6]}"
    _run(session, run, seed, status="active")
    _cluster(session, run, "c0", "Tribe", size=3, eng=0.5)
    _persona(session, "test-u1", seed, ["ai"])
    _persona(session, "test-u2", seed, ["ai"])
    _persona(session, "test-u3", seed, ["ai"])
    _member(session, run, "test-u1", "c0", periphery=True, conf=0.99)   # periphery -> last
    _member(session, run, "test-u2", "c0", periphery=False, conf=0.5)
    _member(session, run, "test-u3", "c0", periphery=False, conf=0.9)   # core, highest conf -> first
    session.commit()
    out = audience.cluster_members(session, seed, "c0", k=10)
    assert out["total_members"] == 3
    order = [m["user_id"] for m in out["members"]]
    assert order == ["test-u3", "test-u2", "test-u1"]
    assert out["members"][0]["ranked_interests"] == ["ai"]


def test_cluster_members_no_active_run(session):
    out = audience.cluster_members(session, "test-seed-none", "c0")
    assert out["status"] == "no_active_run"
