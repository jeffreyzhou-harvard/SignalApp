"""Apply the database schema — the ONLY sanctioned way to create/refresh tables.

Schema single source of truth = the SQLAlchemy ORM in `app/store/db.py`.
Nothing is applied by hand; this CLI (idempotent) is the one entrypoint.

Usage:
    cd backend && uv run python scripts/init_db.py
    # or equivalently:
    cd backend && uv run python -m app.store.db

Reads DATABASE_URL from backend/.env (local docker Postgres or shared Neon).
"""
from app.store import db


def main() -> None:
    db.init_db()
    from sqlalchemy import inspect

    tables = sorted(inspect(db.engine).get_table_names())
    print(f"schema applied to {db.engine.url.host}. tables: {tables}")


if __name__ == "__main__":
    main()
