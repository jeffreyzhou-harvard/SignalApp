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


class HeuristicLabeler:
    def label(self, docs, x, labels, centroids) -> list[ClusterLabel]:
        kw = _cluster_keywords(docs, labels)
        return [
            ClusterLabel(cid, name=" / ".join(words[:3]),
                         one_liner=f"Users talking about {', '.join(words)}",
                         keywords=words)
            for cid, words in kw.items()
        ]


class GrokLabeler:
    """One contrastive call over all clusters. Falls back to heuristic labels on
    any API failure so a demo never dies on labeling."""

    MODEL = "grok-4"

    def label(self, docs, x, labels, centroids) -> list[ClusterLabel]:
        import requests

        kw = _cluster_keywords(docs, labels)
        sections = []
        for cid in sorted(kw):
            ex_idx = pick_exemplars(x, labels, centroids, cid)
            bios = [f"{docs[i].handle}: {docs[i].bio[:200]}" for i in ex_idx]
            posts = [docs[i].posts[0].text[:150] for i in ex_idx if docs[i].posts]
            sections.append(
                f"CLUSTER {cid} (keywords: {', '.join(kw[cid])})\n"
                + "\n".join(bios) + "\nSample posts:\n" + "\n".join(posts)
            )
        prompt = (
            "You are labeling audience segments of an X account for a marketer. "
            "Below are ALL clusters with exemplar members. Label each so it is "
            "DISTINGUISHABLE from the others — no generic 'tech enthusiasts'. "
            "Return JSON: [{\"cluster_id\": int, \"name\": str (<=5 words), "
            "\"one_liner\": str}]\n\n" + "\n\n".join(sections)
        )
        try:
            resp = requests.post(
                "https://api.x.ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {os.environ['XAI_API_KEY']}"},
                json={"model": self.MODEL, "messages": [{"role": "user", "content": prompt}],
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
