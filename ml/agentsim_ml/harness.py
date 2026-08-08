"""Evaluation harness — the four signals from docs/EXPERIMENTS.md.

Silhouette is recorded but is a tiebreaker; the LLM judge is stubbed behind an
interface so runs stay offline until we choose to spend Grok calls on it.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import RANDOM_STATE, RunConfig
from .schema import PersonaDocument


@dataclass
class HarnessScores:
    stability_ari: float
    annotation_purity: float
    silhouette: float
    n_clusters: int
    noise_frac: float

    def to_row(self) -> dict:
        return {
            "stability_ari": round(self.stability_ari, 3),
            "annotation_purity": round(self.annotation_purity, 3),
            "silhouette": round(self.silhouette, 3),
            "n_clusters": self.n_clusters,
            "noise_frac": round(self.noise_frac, 3),
        }


def stability_ari(x: np.ndarray, labels: np.ndarray, cfg: RunConfig) -> float:
    """Bootstrap 80% of rows, re-cluster, ARI vs. the full run's labels."""
    from sklearn.metrics import adjusted_rand_score

    from .cluster import run_clustering

    rng = np.random.default_rng(RANDOM_STATE)
    scores = []
    for _ in range(cfg.stability_bootstraps):
        idx = rng.choice(len(x), size=int(0.8 * len(x)), replace=False)
        try:
            sub = run_clustering(x[idx], cfg)
            scores.append(adjusted_rand_score(labels[idx], sub.labels))
        except ValueError:
            scores.append(0.0)  # degenerate re-cluster counts against stability
    return float(np.mean(scores)) if scores else 0.0


def annotation_purity(docs: list[PersonaDocument], labels: np.ndarray) -> float:
    """Mean over clusters of (share of members whose dominant annotation domain
    matches the cluster's dominant domain). 1.0 = clusters align with X's tags."""
    domains = [d.annotations[0].split("/")[0] if d.annotations else None for d in docs]
    purities = []
    for cid in np.unique(labels):
        members = [domains[i] for i in np.where(labels == cid)[0] if domains[i]]
        if not members:
            continue
        top = max(set(members), key=members.count)
        purities.append(members.count(top) / len(members))
    return float(np.mean(purities)) if purities else 0.0


def silhouette(x: np.ndarray, labels: np.ndarray) -> float:
    from sklearn.metrics import silhouette_score

    if len(np.unique(labels)) < 2:
        return -1.0
    return float(silhouette_score(x, labels, metric="cosine"))


def evaluate(x: np.ndarray, labels: np.ndarray, was_noise: np.ndarray,
             docs: list[PersonaDocument], cfg: RunConfig) -> HarnessScores:
    return HarnessScores(
        stability_ari=stability_ari(x, labels, cfg),
        annotation_purity=annotation_purity(docs, labels),
        silhouette=silhouette(x, labels),
        n_clusters=int(len(np.unique(labels))),
        noise_frac=float(was_noise.mean()),
    )
