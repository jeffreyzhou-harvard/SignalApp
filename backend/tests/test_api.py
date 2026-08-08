import pytest
from fastapi.testclient import TestClient
from app.store import db


@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        for t in (db.PersonaRow, db.JobRow, db.LedgerRow):
            s.query(t).delete()
        s.commit()
    yield


def test_ingest_creates_queued_job():
    from app.main import app
    client = TestClient(app)
    resp = client.post("/ingest", json={"seed": "@seed", "max_followers": 3})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "queued" and body["job_id"]
    got = client.get(f"/ingest/{body['job_id']}")
    assert got.status_code == 200
    assert got.json()["seed"] == "@seed"


def test_ingest_status_404_for_unknown():
    from app.main import app
    client = TestClient(app)
    resp = client.get("/ingest/does-not-exist")
    assert resp.status_code == 404


def test_ingest_list_returns_jobs():
    from app.main import app
    client = TestClient(app)
    client.post("/ingest", json={"seed": "@a", "max_followers": 3})
    client.post("/ingest", json={"seed": "@b", "max_followers": 3})
    resp = client.get("/ingest")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_clusters_stub_returns_fixtures():
    from app.main import app
    client = TestClient(app)
    resp = client.get("/clusters")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_budget_endpoint():
    from app.main import app
    client = TestClient(app)
    resp = client.get("/budget")
    assert resp.status_code == 200
    body = resp.json()
    assert {"spent_usd", "budget_usd", "remaining_usd"} <= set(body)


def test_personas_empty():
    from app.main import app
    client = TestClient(app)
    resp = client.get("/personas", params={"seed_account_id": "123"})
    assert resp.status_code == 200
    assert resp.json() == []
