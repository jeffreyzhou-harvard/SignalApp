# AgentSim backend (FastAPI + MCP server). Host-agnostic container image
# (HF Spaces, Render, Cloud Run, Fly, local — all serve on :8080).
FROM python:3.12-slim

# uv for fast, lockfile-pinned installs.
RUN pip install --no-cache-dir uv

WORKDIR /app

# Install deps first (cached layer) — needs the lockfile + manifest only.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# App code.
COPY . .

# Run the venv's uvicorn directly (no `uv` at runtime → no cache/permission
# needs under non-root hosts like HF Spaces). PYTHONPATH makes `app` importable.
ENV PYTHONPATH=/app
EXPOSE 8080

# Honor an injected $PORT (Render, Cloud Run, …); default 8080 (HF/Fly/local).
# `exec` so uvicorn is PID 1's child target and receives SIGTERM cleanly.
CMD ["sh", "-c", "exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
