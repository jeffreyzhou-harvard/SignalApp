"""Pytest bootstrap.

Force tests onto the LOCAL docker Postgres, never the shared Neon DB configured
in backend/.env. `setdefault` runs before `app.config.Settings()` is constructed,
and an actual env var takes precedence over the .env file — so tests hit local
unless a developer explicitly exports their own DATABASE_URL.
"""
import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://agentsim:agentsim@localhost:5432/agentsim",
)
