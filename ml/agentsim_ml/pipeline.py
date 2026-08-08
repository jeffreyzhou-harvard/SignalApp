"""Orchestration: docs -> compose -> embed -> fuse -> cluster -> label ->
evaluate -> report -> contracts. Each step is a swappable module; this file
only wires them.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .cluster import ClusterResult, run_clustering
from .compose import compose
from .config import RunConfig
from .embed import get_embedder
from .harness import HarnessScores, evaluate
from .label import ClusterLabel, get_labeler
from .report import display_projection, write_report
from .runlog import log_run
from .schema import PersonaDocument
from .sparse import fuse, sparse_features


@dataclass
class RunResult:
    cfg: RunConfig
    scores: HarnessScores
    labels: np.ndarray
    cluster_labels: list[ClusterLabel]
    report_path: Path
    cluster_result: ClusterResult
    coords: np.ndarray
    deep_docs: list[PersonaDocument]


def _profile_card(d) -> dict:
    """Sam's ProfileCard shape (backend/app/models/persona.py)."""
    return {
        "user_id": d.user_id, "handle": d.handle, "display_name": d.display_name,
        "profile_url": d.profile_url, "profile_image_url": d.profile_image_url,
        "bio": d.bio, "verified": d.verified, "followers_count": d.followers_count,
        "top_sample_post": None,
    }


def _write_clusters_json(path: Path, docs, result: ClusterResult,
                         cluster_labels: list[ClusterLabel], coords: np.ndarray):
    """The B -> C/D contract: emits Sam's Cluster schema
    (backend/app/models/persona.py::Cluster) + a display-coords sidecar."""
    from .label import pick_exemplars

    by_id = {cl.cluster_id: cl for cl in cluster_labels}
    pop_engagement = np.mean([d.avg_engagement for d in docs]) or 1.0
    clusters = []
    for cid in np.unique(result.labels):
        m = result.labels == cid
        idx = np.where(m)[0]
        cl = by_id.get(int(cid))
        cluster_engagement = np.mean([docs[i].avg_engagement for i in idx]) or 0.0
        # exemplars via centroid+MMR so downstream sees representative + diverse
        ex_idx = pick_exemplars(coords, result.labels, _centroids_2d(coords, result.labels),
                                int(cid), n_near=3, n_diverse=2)
        clusters.append({
            "schema_version": "1.0",
            "seed_account_id": docs[0].seed_account_id if docs else "",
            "cluster_id": str(int(cid)),
            "label": cl.name if cl else str(cid),
            "persona_card": None,  # C's contrastive card pass fills this
            "size": int(m.sum()),
            "share_of_audience": round(float(m.mean()), 4),
            "engagement_index": round(float(cluster_engagement / pop_engagement), 3),
            "centroid": [round(float(v), 5) for v in result.centroids[int(cid)]],
            "exemplars": [_profile_card(docs[i]) for i in ex_idx],
            "member_ids": [docs[i].user_id for i in idx],
        })
    members = [
        {"user_id": d.user_id, "cluster_id": str(int(result.labels[i])),
         "periphery": bool(result.was_noise[i]),
         "x": float(coords[i, 0]), "y": float(coords[i, 1])}
        for i, d in enumerate(docs)
    ]
    path.write_text(json.dumps({"clusters": clusters, "members": members}, indent=2))


def _centroids_2d(coords: np.ndarray, labels: np.ndarray) -> np.ndarray:
    ids = np.unique(labels)
    return np.vstack([coords[labels == i].mean(axis=0) for i in ids])


def _norm(m: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(m, axis=1, keepdims=True)
    n[n == 0] = 1.0
    return m / n


def _features(cfg: RunConfig, deep: list[PersonaDocument], run_dir: Path) -> np.ndarray:
    if cfg.composition == "T":
        # Arm T: taxonomy backbone ⊕ dense bio ⊕ sparse annotations/mentions.
        from .taxonomy import (derive_taxonomy, load_tags, score_users,
                               strip_first_pc, taxonomy_block)

        if cfg.tags_file:
            tax, tags = load_tags(cfg.tags_file)
        else:
            tax = derive_taxonomy(deep)
            tags = score_users(deep, tax)
        by_uid = {t.user_id: t for t in tags}
        tags = [by_uid[d.user_id] for d in deep if d.user_id in by_uid]
        deep[:] = [d for d in deep if d.user_id in by_uid]
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "tags.json").write_text(json.dumps({
            "domains": tax.domains,
            "users": [{"user_id": t.user_id, "tag_scores": t.tag_scores,
                       "role": t.role, "evidence": t.evidence} for t in tags],
        }, indent=2))
        tax_m = taxonomy_block(tags, tax, role_weight=cfg.role_weight)
        if cfg.strip_common_component:
            tax_m = strip_first_pc(tax_m)
        bio_dense = get_embedder(cfg.embedder).embed([compose(d, "A") for d in deep])
        w_tax, w_bio, w_sparse = cfg.tax_weights
        blocks = [(tax_m, w_tax), (bio_dense, w_bio),
                  (sparse_features(deep), w_sparse)]
        return np.hstack([w * _norm(b) for b, w in blocks if w > 0]).astype(np.float32)

    texts = [compose(d, cfg.composition, cfg.n_posts_in_composition) for d in deep]
    dense = get_embedder(cfg.embedder).embed(texts)
    return fuse(dense, sparse_features(deep), cfg.sparse_weight)


def run(cfg: RunConfig, docs: list[PersonaDocument]) -> RunResult:
    deep = [d for d in docs if d.is_deep]
    x = _features(cfg, deep, cfg.out_dir / cfg.run_id)

    result = run_clustering(x, cfg)
    cluster_labels = get_labeler(cfg.labeler).label(deep, x, result.labels, result.centroids)
    scores = evaluate(x, result.labels, result.was_noise, deep, cfg)

    run_dir = cfg.out_dir / cfg.run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    coords = display_projection(x)
    _write_clusters_json(run_dir / "clusters.json", deep, result, cluster_labels, coords)
    report = write_report(run_dir / "report.html", cfg, deep, x,
                          result.labels, result.was_noise, result.centroids,
                          cluster_labels, scores)
    log_run(cfg.out_dir, {**cfg.to_row(), **scores.to_row(), "report": str(report)})
    return RunResult(cfg, scores, result.labels, cluster_labels, report,
                     cluster_result=result, coords=coords, deep_docs=deep)
