"""AgentSim wind-tunnel service: real A/B simulation on OASIS (camel-ai).

POST /run receives the two post variants plus the audience members to simulate
(the frontend scopes them: one niche or the whole demographic). Each member
becomes an OASIS LLM agent (Grok via the OpenAI-compatible endpoint) whose
persona is their real bio. Two founder agents seed post A and post B, the
random recsys serves both posts, and agents like/repost/comment as themselves.
Results are read back from OASIS's SQLite and shaped like the frontend's
SimResult so the panel needs zero changes.

Run:  uv run uvicorn app:app --port 8100
Env:  XAI_API_KEY (repo root .env is loaded), SIM_MODEL (default grok-4.5)
"""
import asyncio
import os
import sqlite3
import tempfile
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from camel.models import ModelFactory  # noqa: E402
from camel.types import ModelPlatformType  # noqa: E402
import oasis  # noqa: E402
from oasis import ActionType, LLMAction, ManualAction  # noqa: E402
from oasis.social_agent import AgentGraph, SocialAgent  # noqa: E402
from oasis.social_platform import Channel, Platform  # noqa: E402
from oasis.social_platform.config import UserInfo  # noqa: E402

app = FastAPI(title="AgentSim SimLab (OASIS)")

XAI_BASE_URL = os.getenv("XAI_BASE_URL", "https://api.x.ai/v1")
SIM_MODEL = os.getenv("SIM_MODEL", "grok-4.5")

AUDIENCE_ACTIONS = [
    ActionType.LIKE_POST,
    ActionType.REPOST,
    ActionType.CREATE_COMMENT,
    ActionType.DO_NOTHING,
]


class Variant(BaseModel):
    id: str
    copy: str


class Member(BaseModel):
    id: int
    name: str
    handle: str
    bio: str = ""


class RunRequest(BaseModel):
    variants: list[Variant]
    members: list[Member]
    timesteps: int = 2


def _grok_model():
    key = os.getenv("XAI_API_KEY")
    if not key:
        raise HTTPException(500, "XAI_API_KEY is not set for the sim service.")
    return ModelFactory.create(
        model_platform=ModelPlatformType.OPENAI_COMPATIBLE_MODEL,
        model_type=SIM_MODEL,
        url=XAI_BASE_URL,
        api_key=key,
    )


def _build_graph(members: list[Member], model) -> AgentGraph:
    """Agents 0 and 1 are the founder accounts that seed posts A and B;
    audience members start at agent_id 2 (agent_id - 2 == index into members)."""
    graph = AgentGraph()
    founders = [("founder_a", "Posting variant A."), ("founder_b", "Posting variant B.")]
    for i, (name, desc) in enumerate(founders):
        info = UserInfo(name=name, description=desc,
                        profile={"nodes": [], "edges": [],
                                 "other_info": {"user_profile": desc}},
                        recsys_type="twitter")
        graph.add_agent(SocialAgent(agent_id=i, user_info=info, model=model,
                                    agent_graph=graph, available_actions=[]))
    for idx, m in enumerate(members):
        persona = (
            f"You are {m.name} ({m.handle}) on X. Bio: {m.bio or 'no bio'}. "
            "You scroll X like a real person: you only like, repost, or reply to "
            "posts that genuinely fit your interests, and you often do nothing. "
            "When you reply, you write one short casual sentence in your own voice."
        )
        info = UserInfo(name=m.handle.lstrip("@"), description=m.bio or "",
                        profile={"nodes": [], "edges": [],
                                 "other_info": {"user_profile": persona}},
                        recsys_type="twitter")
        graph.add_agent(SocialAgent(agent_id=idx + 2, user_info=info, model=model,
                                    agent_graph=graph,
                                    available_actions=AUDIENCE_ACTIONS))
    return graph


def _read_results(db_path: str, members: list[Member], variants: list[Variant]) -> dict:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # agent_id <-> user_id mapping
    agent_by_user = {r["user_id"]: r["agent_id"] for r in cur.execute("SELECT user_id, agent_id FROM user")}

    # The two seeded posts (agents 0/1 are users created first, original posts only)
    post_variant: dict[int, str] = {}
    for r in cur.execute("SELECT post_id, user_id, content FROM post WHERE original_post_id IS NULL"):
        agent = agent_by_user.get(r["user_id"])
        if agent == 0:
            post_variant[r["post_id"]] = "A"
        elif agent == 1:
            post_variant[r["post_id"]] = "B"

    def member_for(user_id: int) -> Member | None:
        agent = agent_by_user.get(user_id)
        if agent is None or agent < 2 or agent - 2 >= len(members):
            return None
        return members[agent - 2]

    events: list[dict] = []

    for r in cur.execute("SELECT user_id, post_id, created_at FROM like"):
        m, v = member_for(r["user_id"]), post_variant.get(r["post_id"])
        if m and v:
            events.append({"memberId": m.id, "variant": v, "action": "like", "at": r["created_at"]})

    for r in cur.execute(
        "SELECT user_id, original_post_id, created_at FROM post WHERE original_post_id IS NOT NULL"
    ):
        m, v = member_for(r["user_id"]), post_variant.get(r["original_post_id"])
        if m and v:
            events.append({"memberId": m.id, "variant": v, "action": "repost", "at": r["created_at"]})

    for r in cur.execute("SELECT user_id, post_id, content, created_at FROM comment"):
        m, v = member_for(r["user_id"]), post_variant.get(r["post_id"])
        if m and v:
            events.append({
                "memberId": m.id, "variant": v, "action": "reply",
                "reply": (r["content"] or "").strip()[:200], "at": r["created_at"],
            })
    con.close()

    events.sort(key=lambda e: str(e.get("at") or ""))
    for e in events:
        e.pop("at", None)

    n_agents = len(members)
    final = {v.id: {"views": n_agents, "likes": 0, "reposts": 0, "replies": 0, "bookmarks": 0}
             for v in variants}
    for e in events:
        key = {"like": "likes", "repost": "reposts", "reply": "replies"}[e["action"]]
        final[e["variant"]][key] += 1

    def er(t: dict) -> float:
        return round(100 * (t["likes"] + t["reposts"] + t["replies"]) / max(1, t["views"]), 1)

    er_a, er_b = er(final["A"]), er(final["B"])
    winner = "B" if er_b >= er_a else "A"
    hi, lo = max(er_a, er_b), min(er_a, er_b)
    lift = round(((hi - lo) / lo) * 100) if lo > 0 else (100 if hi > 0 else 0)

    win = final[winner]
    drivers = sorted(
        [("likes", win["likes"]), ("reposts", win["reposts"]), ("replies", win["replies"])],
        key=lambda kv: -kv[1],
    )
    driver = " & ".join(name for name, n in drivers[:2] if n > 0) or "views"

    return {
        "events": events,
        "final": final,
        "engagement": {"A": er_a, "B": er_b},
        "verdict": {
            "winner": winner,
            "liftPct": lift,
            "confidencePct": min(96, 55 + 4 * (win["likes"] + win["reposts"] + win["replies"])),
            "driver": driver,
        },
        "provider": f"oasis:{SIM_MODEL}",
        "agentCount": n_agents,
    }


@app.get("/health")
def health():
    return {"status": "ok", "model": SIM_MODEL}


@app.post("/run")
async def run(req: RunRequest):
    if len(req.variants) != 2 or not req.members:
        raise HTTPException(400, "Two variants and at least one member are required.")

    model = _grok_model()
    graph = _build_graph(req.members, model)

    fd, db_path = tempfile.mkstemp(suffix=".db", prefix="oasis-")
    os.close(fd)
    os.unlink(db_path)  # OASIS creates it

    env = oasis.make(
        agent_graph=graph,
        platform=Platform(
            db_path=db_path,
            channel=Channel(),
            recsys_type="random",
            refresh_rec_post_count=2,
            max_rec_post_len=2,
            following_post_count=0,
        ),
    )
    try:
        await env.reset()

        seed = {
            env.agent_graph.get_agent(0): [
                ManualAction(action_type=ActionType.CREATE_POST,
                             action_args={"content": req.variants[0].copy})],
            env.agent_graph.get_agent(1): [
                ManualAction(action_type=ActionType.CREATE_POST,
                             action_args={"content": req.variants[1].copy})],
        }
        await env.step(seed)

        for _ in range(max(1, min(req.timesteps, 4))):
            audience_actions = {
                agent: LLMAction()
                for aid, agent in env.agent_graph.get_agents()
                if aid >= 2
            }
            await env.step(audience_actions)

        await env.close()
        return _read_results(db_path, req.members, req.variants)
    finally:
        try:
            os.unlink(db_path)
        except OSError:
            pass
