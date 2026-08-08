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
from .contracts import (ClusterAggregate, MemberRecord, _centroids_2d,
                        assign_tier1, build_aggregates, build_members)
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
    members: list[MemberRecord]
    aggregates: list[ClusterAggregate]


def _profile_card(d) -> dict:
    """Sam's ProfileCard shape (backend/app/models/persona.py)."""
    return {
        "user_id": d.user_id, "handle": d.handle, "display_name": d.display_name,
        "profile_url": d.profile_url, "profile_image_url": d.profile_image_url,
        "bio": d.bio, "verified": d.verified, "followers_count": d.followers_count,
        "top_sample_post": None,
    }


def _write_clusters_json(path: Path, deep_docs, aggregates: list[ClusterAggregate],
                         members: list[MemberRecord]):
    """The B -> C/D contract: emits Sam's Cluster schema
    (backend/app/models/persona.py::Cluster) + a display-coords sidecar.
    Aggregates/members are built once in `contracts` so the DB write agrees."""
    seed = deep_docs[0].seed_account_id if deep_docs else ""
    clusters = [{
        "schema_version": "1.0",
        "seed_account_id": seed,
        "cluster_id": a.cluster_id,
        "label": a.label,
        "persona_card": None,  # C's contrastive card pass fills this
        "size": a.size,
        "share_of_audience": a.share_of_audience,
        "engagement_index": a.engagement_index,
        "centroid": a.centroid,
        "exemplars": [_profile_card(deep_docs[i]) for i in a.exemplar_idx],
        "member_ids": a.member_ids,
    } for a in aggregates]
    members_json = [{
        "user_id": m.user_id, "cluster_id": m.cluster_id, "periphery": m.periphery,
        "confidence": round(m.confidence, 3), "x": m.x, "y": m.y,
    } for m in members]
    path.write_text(json.dumps({"clusters": clusters, "members": members_json}, indent=2))


def run(cfg: RunConfig, docs: list[PersonaDocument]) -> RunResult:
    deep = [d for d in docs if d.is_deep]
    shallow = [d for d in docs if not d.is_deep]
    embedder = get_embedder(cfg.embedder)
    texts = [compose(d, cfg.composition, cfg.n_posts_in_composition) for d in deep]
    dense = embedder.embed(texts)
    x = fuse(dense, sparse_features(deep), cfg.sparse_weight)

    result = run_clustering(x, cfg)
    cluster_labels = get_labeler(cfg.labeler).label(deep, x, result.labels, result.centroids)
    scores = evaluate(x, result.labels, result.was_noise, deep, cfg)

    coords = display_projection(x)
    coords_2d = _centroids_2d(coords, result.labels)
    # tier-1 (bio-only) followers -> nearest deep bio-centroid, so a run covers
    # the whole audience, not just the deep sample.
    shallow_labels, shallow_conf = assign_tier1(deep, shallow, result.labels, embedder)
    members = build_members(deep, result, coords, shallow, shallow_labels, shallow_conf, coords_2d)
    aggregates = build_aggregates(deep, result, cluster_labels, coords, members)

    run_dir = cfg.out_dir / cfg.run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    _write_clusters_json(run_dir / "clusters.json", deep, aggregates, members)
    report = write_report(run_dir / "report.html", cfg, deep, x,
                          result.labels, result.was_noise, result.centroids,
                          cluster_labels, scores)
    log_run(cfg.out_dir, {**cfg.to_row(), **scores.to_row(), "report": str(report)})
    return RunResult(cfg, scores, result.labels, cluster_labels, report,
                     cluster_result=result, coords=coords, deep_docs=deep,
                     members=members, aggregates=aggregates)
