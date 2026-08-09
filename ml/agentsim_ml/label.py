"""Cluster labeling (experiment E4): exemplar selection + a Labeler interface.

- HeuristicLabeler: top distinguishing TF-IDF terms per cluster — offline, and
  doubles as grounding keywords for the Grok pass.
- GrokLabeler: single contrastive call — all clusters' exemplars in one prompt
  so labels are forced to distinguish, not describe in isolation.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass

import numpy as np

from .schema import PersonaDocument


@dataclass
class ClusterLabel:
    cluster_id: int
    name: str
    one_liner: str
    keywords: list[str]


def pick_exemplars(
    x: np.ndarray, labels: np.ndarray, centroids: np.ndarray,
    cluster_id: int, n_near: int = 5, n_diverse: int = 5,
) -> list[int]:
    """n_near nearest-to-centroid + n_diverse via greedy max-min (MMR-style)."""
    idx = np.where(labels == cluster_id)[0]
    d_to_c = np.linalg.norm(x[idx] - centroids[cluster_id], axis=1)
    near = idx[np.argsort(d_to_c)[:n_near]].tolist()
    chosen = list(near)
    pool = [i for i in idx if i not in chosen]
    while pool and len(chosen) < n_near + n_diverse:
        dist_to_chosen = np.array([
            min(np.linalg.norm(x[p] - x[c]) for c in chosen) for p in pool
        ])
        pick = pool[int(dist_to_chosen.argmax())]
        chosen.append(pick)
        pool.remove(pick)
    return chosen


def _cluster_keywords(docs: list[PersonaDocument], labels: np.ndarray, k: int = 6) -> dict[int, list[str]]:
    from sklearn.feature_extraction.text import TfidfVectorizer

    texts = [d.bio + " " + " ".join(p.text for p in d.posts) for d in docs]
    vec = TfidfVectorizer(max_features=4096, stop_words="english")
    m = vec.fit_transform(texts)
    vocab = np.array(vec.get_feature_names_out())
    out = {}
    for cid in np.unique(labels):
        in_c = np.asarray(m[labels == cid].mean(axis=0)).ravel()
        out_c = np.asarray(m[labels != cid].mean(axis=0)).ravel()
        score = in_c - out_c  # distinguishing, not just frequent
        out[int(cid)] = vocab[np.argsort(score)[::-1][:k]].tolist()
    return out


def _cluster_tag_summaries(docs, labels, tags_path) -> dict[int, str]:
    """Per-cluster mean taxonomy-tag mix + role distribution from tags.json —
    the durable interest signal the labeler should trust most."""
    import json as _json
    from collections import Counter, defaultdict
    from pathlib import Path

    if not tags_path or not Path(tags_path).exists():
        return {}
    data = _json.loads(Path(tags_path).read_text())
    by_uid = {u["user_id"]: u for u in data.get("users", [])}
    out = {}
    for cid in np.unique(labels):
        members = [by_uid[docs[i].user_id] for i in np.where(labels == cid)[0]
                   if docs[i].user_id in by_uid]
        if not members:
            continue
        sums: dict[str, float] = defaultdict(float)
        for m in members:
            for t, v in (m.get("tag_scores") or {}).items():
                sums[t] += v
        top = sorted(sums.items(), key=lambda kv: -kv[1])[:4]
        roles = Counter(m.get("role", "?") for m in members).most_common(2)
        out[int(cid)] = (
            ", ".join(f"{t} {v/len(members):.2f}" for t, v in top)
            + " | roles: " + ", ".join(f"{r} {n}" for r, n in roles)
        )
    return out


class HeuristicLabeler:
    def label(self, docs, x, labels, centroids, tags_path=None) -> list[ClusterLabel]:
        kw = _cluster_keywords(docs, labels)
        return [
            ClusterLabel(cid, name=" / ".join(words[:3]),
                         one_liner=f"Users talking about {', '.join(words)}",
                         keywords=words)
            for cid, words in kw.items()
        ]


class GrokLabeler:
    """One contrastive call over all clusters. Labels from DURABLE evidence —
    bios, taxonomy tag mixes, roles — with recent posts secondary, so segments
    get generalized marketing-persona names rather than topic-of-the-week ones.
    Falls back to heuristic labels on any API failure so a demo never dies."""

    MODEL = "grok-4"

    def label(self, docs, x, labels, centroids, tags_path=None) -> list[ClusterLabel]:
        import requests

        kw = _cluster_keywords(docs, labels)
        tag_info = _cluster_tag_summaries(docs, labels, tags_path)
        sections = []
        for cid in sorted(kw):
            ex_idx = pick_exemplars(x, labels, centroids, cid)
            bios = [f"{docs[i].handle}: {docs[i].bio[:200]}" for i in ex_idx]
            posts = [docs[i].posts[0].text[:120] for i in ex_idx[:4] if docs[i].posts]
            head = f"CLUSTER {cid}"
            if cid in tag_info:
                head += f" | interest mix: {tag_info[cid]}"
            sections.append(
                head + f" | keywords: {', '.join(kw[cid])}\nBios:\n"
                + "\n".join(bios) + "\nRecent posts (secondary evidence):\n"
                + "\n".join(posts)
            )
        prompt = (
            "You are naming durable audience segments of an X account for a "
            "marketer planning campaigns months from now. Below are ALL clusters "
            "with interest mixes, member bios (PRIMARY evidence), and recent posts "
            "(SECONDARY — beware: recent posts over-represent this week's events "
            "and trending products; do NOT name a segment after a current event, "
            "hackathon, or specific product unless the BIOS show it is the "
            "segment's lasting identity). Name each segment so it is "
            "DISTINGUISHABLE from the others, generalized, and stable over time — "
            "prefer role + interest-domain phrasing (e.g. 'Generative AI Creators', "
            "'Enterprise ML Engineers'), never 'tech enthusiasts'. "
            "Return JSON: [{\"cluster_id\": int, \"name\": str (<=4 words), "
            "\"one_liner\": str}]\n\n" + "\n\n".join(sections)
        )
        try:
            resp = requests.post(
                "https://api.x.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {os.environ['XAI_API_KEY']}"},
                json={"model": self.MODEL, "temperature": 0.1,
                      "messages": [{"role": "user", "content": prompt}],
                      "response_format": {"type": "json_object"}},
                timeout=60,
            )
            resp.raise_for_status()
            data = json.loads(resp.json()["choices"][0]["message"]["content"])
            items = data if isinstance(data, list) else next(iter(data.values()))
            return [
                ClusterLabel(it["cluster_id"], it["name"], it.get("one_liner", ""),
                             kw.get(it["cluster_id"], []))
                for it in items
            ]
        except Exception:
            return HeuristicLabeler().label(docs, x, labels, centroids)


def get_labeler(name: str):
    return GrokLabeler() if name == "grok" else HeuristicLabeler()
