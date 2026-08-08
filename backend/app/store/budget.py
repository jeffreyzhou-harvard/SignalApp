import uuid
from sqlalchemy import select, func
from app.store import db
from app.pricing import cost_of


class BudgetExceeded(Exception):
    pass


def record_cost(session, *, resource, count, provider="x", job_id=None, dedup_hit=False) -> float:
    total = 0.0 if dedup_hit else cost_of(resource, count)
    session.add(db.LedgerRow(
        id=str(uuid.uuid4()), job_id=job_id, provider=provider, resource=resource,
        count=count, unit_cost_usd=cost_of(resource, 1), total_usd=total, dedup_hit=dedup_hit,
    ))
    return total


def spent(session) -> float:
    return float(session.execute(select(func.coalesce(func.sum(db.LedgerRow.total_usd), 0.0))).scalar_one())


def remaining(session, cap: float) -> float:
    return max(0.0, cap - spent(session))


def guard(session, *, resource, count, soft_limit: float) -> None:
    if spent(session) + cost_of(resource, count) > soft_limit:
        raise BudgetExceeded(f"{resource}x{count} would breach soft limit {soft_limit}")
