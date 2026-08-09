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
    # v2 arms: reply text already excluded from "posts"; "engaged" adds parent
    # posts the user interacted with (consumption evidence)
    "F": ["bio", "posts", "engaged", "annotations"],
}

# Arm T (taxonomy backbone) is not a text composition — see taxonomy.py:
# features = taxonomy scores ⊕ dense bio embedding ⊕ sparse block.
TAXONOMY_ARM = "T"


@dataclass
class RunConfig:
    run_id: str
    composition: str = "T"          # frozen winner (see docs/EXPERIMENTS.md); A-F = experiment arms
    embedder: str = "local"          # "local" | "gemini" | "xai"
    sparse_weight: float = 0.2       # used by text arms; arm T uses tax_weights
    algorithm: str = "kmeans"        # "kmeans" | "umap_hdbscan" | "agglomerative"
    n_clusters: int = 8              # kmeans / agglomerative
    hdbscan_min_cluster_frac: float = 0.035
    umap_dims: int = 12
    umap_neighbors: int = 30
    min_export_size: int = 25        # scaled-down default for ~1.5k deep samples
    n_posts_in_composition: int = 6
    labeler: str = "grok"            # falls back to heuristic without XAI_API_KEY
    tags_file: str | None = None     # reuse a prior run's tags.json (skip Grok scoring)
    tax_weights: tuple = (0.5, 0.3, 0.2)  # taxonomy, bio-dense, sparse
    role_weight: float = 0.5         # 0 disables role one-hot in the tax block
    strip_common_component: bool = False  # remove shared 1st PC (audience-wide sameness)
    stability_bootstraps: int = 5
    out_dir: Path = field(default=Path("runs"))

    def to_row(self) -> dict:
        d = asdict(self)
        d["out_dir"] = str(d["out_dir"])
        return d
