#!/usr/bin/env bash
# Stable public URL for the MCP server via a Cloudflare *named* tunnel, so the URL
# never rotates and Vercel's AUDIENCE_MCP_URL stays valid forever.
#
# One-time prereqs you do yourself (interactive):
#   1. Add a domain to your Cloudflare account (free plan is fine).
#   2. cloudflared tunnel login        # browser auth; pick that domain
#
# Then run this once:
#   ./scripts/setup-named-tunnel.sh mcp.yourdomain.com
#
# It creates the tunnel, routes DNS, writes the tunnel config, and sets
# MCP_ALLOWED_HOSTS in backend/.env. After it prints OK, start the server and the
# tunnel (see the printed "Next" steps), and set AUDIENCE_MCP_URL on Vercel once.
set -euo pipefail

HOSTNAME="${1:-}"
if [[ -z "${HOSTNAME}" ]]; then
  echo "usage: $0 <hostname>   e.g. mcp.yourdomain.com" >&2
  exit 1
fi

TUNNEL="${TUNNEL_NAME:-agentsim-mcp}"
PORT="${MCP_PORT:-8000}"
CF_DIR="${HOME}/.cloudflared"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

command -v cloudflared >/dev/null || { echo "cloudflared not installed — 'brew install cloudflared'"; exit 1; }
[[ -f "${CF_DIR}/cert.pem" ]] || { echo "run 'cloudflared tunnel login' first (browser auth)"; exit 1; }

# 1. Create the named tunnel if it doesn't already exist (idempotent).
if ! cloudflared tunnel list 2>/dev/null | awk 'NR>1{print $2}' | grep -qx "${TUNNEL}"; then
  cloudflared tunnel create "${TUNNEL}"
fi
UUID="$(cloudflared tunnel list | awk -v t="${TUNNEL}" 'NR>1 && $2==t {print $1}')"

# 2. Point the hostname at this tunnel (safe to re-run).
cloudflared tunnel route dns "${TUNNEL}" "${HOSTNAME}"

# 3. Write the ingress config cloudflared runs from.
cat > "${CF_DIR}/config.yml" <<EOF
tunnel: ${TUNNEL}
credentials-file: ${CF_DIR}/${UUID}.json
ingress:
  - hostname: ${HOSTNAME}
    service: http://localhost:${PORT}
  - service: http_status:404
EOF

# 4. Let the MCP server accept requests with this Host (DNS-rebinding allow-list).
if [[ -f "${ENV_FILE}" ]] && grep -q '^MCP_ALLOWED_HOSTS=' "${ENV_FILE}"; then
  grep -v '^MCP_ALLOWED_HOSTS=' "${ENV_FILE}" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "${ENV_FILE}"
fi
printf 'MCP_ALLOWED_HOSTS=%s\n' "${HOSTNAME}" >> "${ENV_FILE}"

cat <<DONE

✔ Named tunnel '${TUNNEL}' -> https://${HOSTNAME}
  config:  ${CF_DIR}/config.yml
  backend/.env: MCP_ALLOWED_HOSTS=${HOSTNAME}

Next:
  uv run uvicorn app.main:app --port ${PORT}    # start the MCP server
  cloudflared tunnel run ${TUNNEL}              # start the tunnel (foreground)
    # keep it always-on instead:  sudo cloudflared service install

Set on Vercel ONCE (Production + Preview), then redeploy:
  AUDIENCE_MCP_URL=https://${HOSTNAME}/mcp

MCP endpoint: https://${HOSTNAME}/mcp
DONE
