"""MCP server exposing the ingested X audience to MCP-native agents.

Thin skin over app/retrieval (search) and app/store/personas (lookup). Tool
docstrings are the agent-facing contract — write them for an LLM caller.
Mounted into FastAPI at /mcp in app/main.py.
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from app.config import settings
from app.store import db, personas, clusters, audience
from app.retrieval import search as search_core
from app.retrieval.embedder import get_embedder

# DNS-rebinding protection stays ON and trusts only localhost by default, which
# 421s any request whose Host isn't localhost — including xAI's server-side MCP
# executor reaching us via a public tunnel / deploy. Rather than disable the
# check, allow-list explicit public hosts via config (settings.mcp_allowed_hosts);
# empty default keeps the secure localhost-only behavior.
_LOCAL_HOSTS = ["127.0.0.1:*", "localhost:*", "[::1]:*"]
_extra_hosts = [h.strip() for h in settings.mcp_allowed_hosts.split(",") if h.strip()]
mcp = FastMCP(
    "AgentSim Audience",
    stateless_http=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=_LOCAL_HOSTS + _extra_hosts,
    ),
)
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


@mcp.tool()
def list_audiences() -> dict:
    """List the ingested X audiences you can analyze.

    Start here: returns each seed account's handle, numeric seed_account_id,
    persona counts, and whether interest tribes (clusters) are available. Pass a
    seed_account_id from here into the other tools.
    """
    with db.SessionLocal() as s:
        return {"audiences": audience.list_audiences(s)}


@mcp.tool()
def audience_overview(seed_account_id: str) -> dict:
    """High-level brief for one audience: total reach, number of interest tribes,
    the biggest tribe, and the most-engaged tribe. Good first call after
    list_audiences before drilling into specific tribes or people.
    """
    with db.SessionLocal() as s:
        return audience.audience_overview(s, seed_account_id)


@mcp.tool()
def list_clusters(seed_account_id: str) -> dict:
    """List the interest tribes (clusters) for an audience.

    Each tribe has a label, size, share_of_audience, engagement_index, and a
    one-liner / keywords describing what they care about. This is the audience map.
    """
    with db.SessionLocal() as s:
        return {"clusters": clusters.load_clusters(s, seed_account_id)}


@mcp.tool()
def get_cluster_members(seed_account_id: str, cluster_id: str, k: int = 20) -> dict:
    """List the actual people in one interest tribe (core members first).

    Returns up to k persona summaries (handle, bio, followers, one-liner,
    interests) for the given cluster_id in the audience's active run.
    """
    with db.SessionLocal() as s:
        return audience.cluster_members(s, seed_account_id, cluster_id, k=k)


@mcp.tool()
def whose_tribe(handle_or_id: str, seed_account_id: str) -> dict:
    """Which interest tribe a specific person belongs to within an audience.

    Accepts an @handle or numeric user id. Returns the tribe's id/label/one-liner
    plus assignment confidence, or {"status": "not_found"}.
    """
    with db.SessionLocal() as s:
        doc = personas.find_persona(s, handle_or_id)
        if doc is None:
            return {"status": "not_found", "handle_or_id": handle_or_id}
        tribe = clusters.cluster_for_user(s, doc.user_id, seed_account_id)
    if tribe is None:
        return {"status": "no_tribe", "user_id": doc.user_id,
                "seed_account_id": seed_account_id}
    return {"user_id": doc.user_id, "handle": doc.handle, **tribe}


@mcp.tool()
def top_interests(seed_account_id: str, k: int = 15) -> dict:
    """The most common interests across an audience (from persona cards).

    Returns interests ranked by how many personas list them — useful for shaping
    launch messaging to what the audience actually cares about.
    """
    with db.SessionLocal() as s:
        return audience.top_interests(s, seed_account_id, k=k)
