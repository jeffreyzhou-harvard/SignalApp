"""MCP server exposing the ingested X audience to MCP-native agents.

Thin skin over app/retrieval (search) and app/store/personas (lookup). Tool
docstrings are the agent-facing contract — write them for an LLM caller.
Mounted into FastAPI at /mcp in app/main.py.
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from app.store import db, personas
from app.retrieval import search as search_core
from app.retrieval.embedder import get_embedder

mcp = FastMCP("AgentSim Audience", stateless_http=True)
# Mounted under /mcp in main.py; keep this app's internal path at root so the
# public endpoint is exactly /mcp (not /mcp/mcp).
mcp.settings.streamable_http_path = "/"


@mcp.tool()
def search(query: str, k: int = 10, seed_account_id: str | None = None) -> dict:
    """Semantically search the ingested X audience for people matching a description.

    Args:
        query: natural-language description of the people to find
            (e.g. "founders interested in AI agents").
        k: max number of personas to return (default 10).
        seed_account_id: optional — restrict to one ingested audience.

    Returns a dict with "status" and "results" (ranked personas with a similarity
    "score"). status == "embeddings_not_ready" means embeddings are not populated
    yet; try get_persona or retry later.
    """
    with db.SessionLocal() as s:
        return search_core.search(s, get_embedder(), query, k=k,
                                  seed_account_id=seed_account_id)


@mcp.tool()
def get_persona(handle_or_id: str) -> dict:
    """Fetch one ingested persona by @handle or numeric user id.

    Returns the full persona document (identity, metrics, persona card), or
    {"status": "not_found"} if no such person was ingested.
    """
    with db.SessionLocal() as s:
        doc = personas.find_persona(s, handle_or_id)
    if doc is None:
        return {"status": "not_found", "handle_or_id": handle_or_id}
    return doc.model_dump(mode="json")
