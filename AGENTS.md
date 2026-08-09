# AgentSim — agent notes

See [CLAUDE.md](CLAUDE.md) for repo rules (git attribution, modular design).

## Dev harness (Grok Build)

Run `grok` in the repo root. It picks up `.mcp.json` (audience vector MCP —
export AUDIENCE_MCP_URL / AUDIENCE_MCP_TOKEN first) and `.grok/skills/`
(imagine-poster). Use it to exercise MCP + Imagine tools conversationally;
the production path is the in-app VoiceDock (src/lib/voice/).

## Voice harness map

- `src/lib/voice/session.ts` — the ONE place tools + copilot instructions live
- `src/lib/voice/tools.ts` — client-side handlers (add a tool: one entry in each)
- `src/lib/voice/client.ts` — realtime WebSocket client (voice + text, one session)
- `/api/voice/token` — ephemeral key mint + session payload
- `/api/imagine`, `/api/x/post` — tool-shaped routes (posting is draft-first,
  gated by X_POSTING_ENABLED)
