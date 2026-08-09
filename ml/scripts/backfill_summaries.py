"""Retroactively generate per-cluster creative-brief summaries for a stored run.

New runs get summaries at cluster time (GrokLabeler); this fills them in for
runs clustered before the field existed. One contrastive Grok call per run,
grounded in each cluster's exemplar bios (from the run dir's clusters.json)
and taxonomy tag mixes (tags.json), then written into clusters.doc in Neon.

Usage: PYTHONPATH=. uv run python scripts/backfill_summaries.py <run_id> [<run_id>...]
Env: DATABASE_URL + X_AI_API_KEY (from ../.env via your shell).
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

from sqlalchemy import create_engine, text

from agentsim_ml.taxonomy import _grok

RUNS_DIR = Path(__file__).resolve().parent.parent / "runs"


def tag_mixes(run_dir: Path, clusters: list[dict]) -> dict[str, str]:
    """cluster_id -> 'top tag mix | roles' line, from the run's tags.json."""
    tags_path = run_dir / "tags.json"
    if not tags_path.exists():
        return {}
    by_uid = {u["user_id"]: u for u in json.loads(tags_path.read_text()).get("users", [])}
    out = {}
    for c in clusters:
        members = [by_uid[uid] for uid in c.get("member_ids", []) if uid in by_uid]
        if not members:
            continue
        sums: dict[str, float] = defaultdict(float)
        for m in members:
            for t, v in (m.get("tag_scores") or {}).items():
                sums[t] += v
        top = sorted(sums.items(), key=lambda kv: -kv[1])[:4]
        roles = Counter(m.get("role", "?") for m in members).most_common(2)
        out[c["cluster_id"]] = (
            ", ".join(f"{t} {v / len(members):.2f}" for t, v in top)
            + " | roles: " + ", ".join(f"{r} {n}" for r, n in roles)
        )
    return out


def backfill(engine, run_id: str) -> None:
    run_dir = RUNS_DIR / run_id
    clusters = json.loads((run_dir / "clusters.json").read_text())["clusters"]
    mixes = tag_mixes(run_dir, clusters)

    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT cluster_id, label, doc FROM clusters WHERE run_id = :r"
        ), {"r": run_id}).all()
    labels = {r.cluster_id: (r.label, r.doc or {}) for r in rows}
    if not labels:
        raise SystemExit(f"run {run_id} not found in DB")

    sections = []
    for c in clusters:
        cid = c["cluster_id"]
        label, doc = labels.get(cid, (c.get("label", cid), {}))
        bios = [f"{e.get('handle')}: {(e.get('bio') or '')[:200]}"
                for e in c.get("exemplars", [])[:8] if e.get("bio")]
        head = f"CLUSTER {cid} — \"{label}\" ({c.get('size')} members)"
        if doc.get("one_liner"):
            head += f" | one-liner: {doc['one_liner']}"
        if cid in mixes:
            head += f" | interest mix: {mixes[cid]}"
        sections.append(head + "\nExemplar bios:\n" + "\n".join(bios))

    out = _grok(
        "Below are ALL audience segments of one X account, already named. For "
        "EACH, write a 3-4 sentence creative brief for a marketing team: who "
        "this segment is, what they care about and talk about, and what tone, "
        "aesthetics, and hooks resonate with them — concrete enough to "
        "art-direct marketing imagery for THIS segment vs the others, while "
        "staying durable months from now (no current events or trending "
        'products). Return JSON: {"summaries": [{"cluster_id": str, '
        '"summary": str}]}\n\n' + "\n\n".join(sections),
        timeout=120,
    )
    items = out.get("summaries") or next(iter(out.values()))
    by_cid = {str(i.get("cluster_id")): str(i.get("summary") or "") for i in items}

    with engine.begin() as conn:
        for cid, summary in by_cid.items():
            if not summary:
                continue
            conn.execute(text(
                "UPDATE clusters SET doc = jsonb_set(COALESCE(doc, '{}'::jsonb),"
                " '{summary}', to_jsonb(CAST(:s AS text))) WHERE run_id = :r AND cluster_id = :c"
            ), {"s": summary, "r": run_id, "c": cid})
    print(f"{run_id}: wrote summaries for {sum(1 for s in by_cid.values() if s)}"
          f"/{len(clusters)} clusters")
    for cid, s in sorted(by_cid.items()):
        print(f"  [{cid}] {labels.get(cid, ('?',))[0]}: {s[:110]}…")


if __name__ == "__main__":
    import os
    engine = create_engine(os.environ["DATABASE_URL"].replace("postgres://", "postgresql://"))
    for rid in sys.argv[1:]:
        backfill(engine, rid)
