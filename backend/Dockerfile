# AgentSim backend (FastAPI + MCP server) for Fly.io.
FROM python:3.12-slim

# uv for fast, lockfile-pinned installs.
RUN pip install --no-cache-dir uv

WORKDIR /app

# Install deps first (cached layer) — needs the lockfile + manifest only.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# App code.
COPY . .

ENV PORT=8080
EXPOSE 8080

# 0.0.0.0 so Fly's proxy can reach it; port matches fly.toml internal_port.
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
