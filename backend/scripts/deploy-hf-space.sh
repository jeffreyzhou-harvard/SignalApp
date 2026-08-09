#!/usr/bin/env bash
# Deploy the MCP server to a Hugging Face Docker Space — free, stable *.hf.space
# URL, no domain, no card. The repo is private, so the Space holds the code.
#
# One-time setup (you do this once):
#   pip install -U huggingface_hub                 # provides huggingface-cli
#   huggingface-cli login                          # paste an HF token (WRITE access)
#   # create the Space at https://huggingface.co/new-space  (SDK: Docker), e.g.
#   #   owner=<your-hf-username>  name=agentsim-mcp
#
# Deploy / redeploy (repeatable, one command):
#   ./scripts/deploy-hf-space.sh <hf-username>/agentsim-mcp
#
# After the first deploy, in the Space's Settings -> Variables and secrets, set:
#   DATABASE_URL, GEMINI_API_KEY, MCP_ALLOWED_HOSTS=<username>-agentsim-mcp.hf.space, RUN_WORKER=false
# then on Vercel (once): AUDIENCE_MCP_URL=https://<username>-agentsim-mcp.hf.space/mcp
set -euo pipefail

REPO="${1:-}"   # <hf-username>/<space-name>
[[ -n "$REPO" ]] || { echo "usage: $0 <hf-username>/<space-name>   e.g. sam/agentsim-mcp" >&2; exit 1; }

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Cloning Space $REPO ..."
git clone "https://huggingface.co/spaces/${REPO}" "$WORK/space"
cd "$WORK/space"

# Refresh the build inputs from backend/ (exclude tests, .env, venv, caches).
rm -rf app pyproject.toml uv.lock Dockerfile scripts/init_db.py
cp -R "$BACKEND/app" .
cp "$BACKEND/pyproject.toml" "$BACKEND/uv.lock" "$BACKEND/Dockerfile" .

# HF Space metadata — app_port MUST match the Dockerfile (8080).
cat > README.md <<'EOF'
---
title: AgentSim MCP
emoji: 🎯
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 8080
pinned: false
---

# AgentSim Audience MCP server

Streamable-HTTP MCP server over the ingested X audience (search, clusters,
personas). MCP endpoint: `/mcp`. Configure via Space secrets: `DATABASE_URL`,
`GEMINI_API_KEY`, `MCP_ALLOWED_HOSTS` (this Space's host), `RUN_WORKER=false`.
EOF

git add -A
git commit -m "deploy backend MCP server" || { echo "(nothing changed)"; exit 0; }
git push

HOST="$(echo "$REPO" | tr '/' '-').hf.space"
cat <<DONE

✔ Pushed — HF is building the Space now (watch the build log on the Space page).
  URL:          https://${HOST}
  MCP endpoint: https://${HOST}/mcp

Set in Space Settings -> Variables and secrets (first deploy only):
  DATABASE_URL=<neon url>
  GEMINI_API_KEY=<key>
  MCP_ALLOWED_HOSTS=${HOST}
  RUN_WORKER=false

Then on Vercel (once):  AUDIENCE_MCP_URL=https://${HOST}/mcp
DONE
