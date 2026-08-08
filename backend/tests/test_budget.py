import pytest
from app.store import db, budget

@pytest.fixture(autouse=True)
def _init():
    db.init_db()
    with db.SessionLocal() as s:
        s.query(db.LedgerRow).delete(); s.commit()
    yield

def test_dedup_hit_is_free_and_spent_sums():
    with db.SessionLocal() as s:
        budget.record_cost(s, resource="followers", count=100)         # $1.00
        budget.record_cost(s, resource="followers", count=100, dedup_hit=True)  # $0
        s.commit()
        assert budget.spent(s) == 1.00

def test_guard_trips_before_soft_limit():
    with db.SessionLocal() as s:
        budget.record_cost(s, resource="followers", count=100); s.commit()  # $1
        with pytest.raises(budget.BudgetExceeded):
            budget.guard(s, resource="post", count=1000, soft_limit=1.50)   # +$5 > $1.50
