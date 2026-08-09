"""The B -> C/D contract, built once from a clustering run.

Two builders that are the *single source* of the per-cluster aggregates and the
per-user membership consumed by both emitters (clusters.json and the DB write):

- `build_members`  -> every user (deep + assigned tier-1) with cluster, confidence,
                      periphery flag and 2D map coords.
- `build_aggregates` -> per-cluster size / share / engagement / centroid / member_ids
                      / exemplar indices.

Cluster shape (centroid, engagement, exemplars) is defined by the deep sample —
that is what was actually clustered. Size and share span the *full* audience,
because tier-1 followers are assigned onto the deep centroids here.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

import numpy as np

from .assign import assign, bio_centroids
from .cluster import ClusterResult
from .compose import compose_bio_only
from .label import ClusterLabel, pick_exemplars
from .schema import PersonaDocument


@dataclass
class MemberRecord:
    user_id: str
    cluster_id: str
    periphery: bool          # HDBSCAN noise (deep only); tier-1 assignments are False
    confidence: float        # 1.0 for deep members; 2nd/1st distance ratio for tier-1
    x: float
    y: float


@dataclass
class ClusterAggregate:
    cluster_id: str
    label: str
    one_liner: str
    keywords: list[str]
    summary: str             # creative brief for cluster-distinct Imagine material
    size: int                # full audience: deep members + assigned tier-1
    share_of_audience: float
    engagement_index: float  # deep-sample based (tier-1 has no post signal)
    centroid: list[float]    # deep feature-space centroid
    member_ids: list[str] = field(default_factory=list)
    exemplar_idx: list[int] = field(default_factory=list)  # indices into deep_docs


def _centroids_2d(coords: np.ndarray, labels: np.ndarray) -> np.ndarray:
    """Per-cluster centroid in 2D display space, indexed by compact cluster id."""
    ids = np.unique(labels)
    return np.vstack([coords[labels == i].mean(axis=0) for i in ids])


def assign_tier1(deep_docs: list[PersonaDocument], shallow_docs: list[PersonaDocument],
                 deep_labels: np.ndarray, embedder):
    """Assign bio-only (tier-1) followers to the nearest deep bio-centroid.

    Deep and shallow bios are embedded in a *single* call so they share one
    vector space (required for corpus-fit embedders like TF-IDF/SVD).
    Returns (labels, confidence) aligned to `shallow_docs`; empty arrays if none.
    """
    if not shallow_docs:
        return np.array([], dtype=int), np.array([], dtype=float)
    bios = ([compose_bio_only(d) for d in deep_docs]
            + [compose_bio_only(d) for d in shallow_docs])
    bio_x = embedder.embed(bios)
    n_deep = len(deep_docs)
    cents = bio_centroids(bio_x[:n_deep], deep_labels)
    a = assign(bio_x[n_deep:], cents)
    return a.labels, a.confidence


def build_members(deep_docs, result: ClusterResult, coords: np.ndarray,
                  shallow_docs, shallow_labels: np.ndarray, shallow_conf: np.ndarray,
                  coords_2d: np.ndarray) -> list[MemberRecord]:
    members = [
        MemberRecord(user_id=d.user_id, cluster_id=str(int(result.labels[i])),
                     periphery=bool(result.was_noise[i]), confidence=1.0,
                     x=float(coords[i, 0]), y=float(coords[i, 1]))
        for i, d in enumerate(deep_docs)
    ]
    for j, d in enumerate(shallow_docs):
        cid = int(shallow_labels[j])
        members.append(MemberRecord(
            user_id=d.user_id, cluster_id=str(cid), periphery=False,
            confidence=float(shallow_conf[j]),
            x=float(coords_2d[cid, 0]), y=float(coords_2d[cid, 1]),
        ))
    return members


def build_aggregates(deep_docs, result: ClusterResult,
                     cluster_labels: list[ClusterLabel], coords: np.ndarray,
                     members: list[MemberRecord]) -> list[ClusterAggregate]:
    by_id = {cl.cluster_id: cl for cl in cluster_labels}
    pop_engagement = float(np.mean([d.avg_engagement for d in deep_docs]) or 1.0)
    total = len(members) or 1
    ids_by_cluster: dict[str, list[str]] = defaultdict(list)
    for m in members:
        ids_by_cluster[m.cluster_id].append(m.user_id)
    centroids_2d = _centroids_2d(coords, result.labels)

    aggs = []
    for cid in np.unique(result.labels):
        cid_i = int(cid)
        deep_idx = np.where(result.labels == cid)[0]
        cl = by_id.get(cid_i)
        cluster_engagement = float(np.mean([deep_docs[i].avg_engagement for i in deep_idx]) or 0.0)
        mem_ids = ids_by_cluster.get(str(cid_i), [])
        aggs.append(ClusterAggregate(
            cluster_id=str(cid_i),
            label=cl.name if cl else str(cid_i),
            one_liner=cl.one_liner if cl else "",
            keywords=cl.keywords if cl else [],
            summary=cl.summary if cl else "",
            size=len(mem_ids),
            share_of_audience=round(len(mem_ids) / total, 4),
            engagement_index=round(cluster_engagement / pop_engagement, 3),
            centroid=[round(float(v), 5) for v in result.centroids[cid_i]],
            member_ids=mem_ids,
            exemplar_idx=pick_exemplars(coords, result.labels, centroids_2d,
                                        cid_i, n_near=3, n_diverse=2),
        ))
    return aggs
