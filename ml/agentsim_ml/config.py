"""All knobs in one place. Every experiment arm is a RunConfig variation."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from pathlib import Path

RANDOM_STATE = 42

# Ingest-tier knobs (mirrors docs/ARCHITECTURE.md; owned by layer A but repeated
# here so the assignment pass and fixtures agree with the spec)
SAMPLE_MAX = 10_000
DEEP_ENRICH_MAX = 1_500
EXPORT_MIN_CLUSTER = 100  # smallest audience worth exporting at 10k scale

COMPOSITION_ARMS = {
    "A": ["bio"],
    "B": ["bio", "posts"],
    "C": ["bio", "posts", "annotations"],
    "D": ["card"],
    "E": ["bio", "posts", "annotations", "card"],
}


@dataclass
class RunConfig:
    run_id: str
    composition: str = "E"          # key into COMPOSITION_ARMS
    embedder: str = "local"          # "local" | "gemini" | "xai"
    sparse_weight: float = 0.0       # 0 disables the sparse block
    algorithm: str = "kmeans"        # "kmeans" | "umap_hdbscan" | "agglomerative"
    n_clusters: int = 8              # kmeans / agglomerative
    hdbscan_min_cluster_frac: float = 0.035
    umap_dims: int = 12
    umap_neighbors: int = 30
    min_export_size: int = 25        # scaled-down default for ~1.5k deep samples
    n_posts_in_composition: int = 6
    labeler: str = "heuristic"       # "heuristic" | "grok"
    stability_bootstraps: int = 5
    out_dir: Path = field(default=Path("runs"))

    def to_row(self) -> dict:
        d = asdict(self)
        d["out_dir"] = str(d["out_dir"])
        return d
