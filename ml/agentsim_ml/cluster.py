"""Clustering backends behind one interface (experiment E3), plus the
product-constraint postprocessing every backend shares:

1. every user gets a cluster (HDBSCAN noise -> nearest centroid, flag kept)
2. clusters below the exportable minimum merge into their nearest neighbor
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import RANDOM_STATE, RunConfig


@dataclass
class ClusterResult:
    labels: np.ndarray            # final cluster id per row, no -1s
    was_noise: np.ndarray         # bool per row (HDBSCAN periphery flag)
    centroids: np.ndarray         # cluster id -> centroid in feature space


def _centroids(x: np.ndarray, labels: np.ndarray) -> np.ndarray:
    ids = np.unique(labels[labels >= 0])
    return np.vstack([x[labels == i].mean(axis=0) for i in ids])


def _nearest_centroid(x: np.ndarray, centroids: np.ndarray) -> np.ndarray:
    dists = np.linalg.norm(x[:, None, :] - centroids[None, :, :], axis=2)
    return dists.argmin(axis=1)


def _relabel_compact(labels: np.ndarray) -> np.ndarray:
    ids = np.unique(labels)
    remap = {old: new for new, old in enumerate(ids)}
    return np.array([remap[v] for v in labels])


def _merge_small(x: np.ndarray, labels: np.ndarray, min_size: int) -> np.ndarray:
    labels = labels.copy()
    while True:
        ids, counts = np.unique(labels, return_counts=True)
        if len(ids) <= 2 or counts.min() >= min_size:
            return _relabel_compact(labels)
        small = ids[counts.argmin()]
        cents = {i: x[labels == i].mean(axis=0) for i in ids}
        others = [i for i in ids if i != small]
        nearest = min(others, key=lambda i: np.linalg.norm(cents[small] - cents[i]))
        labels[labels == small] = nearest


def _reduce_for_density(x: np.ndarray, cfg: RunConfig) -> np.ndarray:
    """UMAP to ~12 dims for HDBSCAN; PCA fallback keeps the pipeline alive if
    umap/numba are unavailable on this machine."""
    try:
        from umap import UMAP

        return UMAP(
            n_components=cfg.umap_dims,
            n_neighbors=min(cfg.umap_neighbors, len(x) - 1),
            metric="cosine",
            random_state=RANDOM_STATE,
        ).fit_transform(x)
    except ImportError:
        from sklearn.decomposition import PCA

        return PCA(n_components=min(cfg.umap_dims, x.shape[1]),
                   random_state=RANDOM_STATE).fit_transform(x)


def run_clustering(x: np.ndarray, cfg: RunConfig) -> ClusterResult:
    was_noise = np.zeros(len(x), dtype=bool)

    if cfg.algorithm == "kmeans":
        from sklearn.cluster import KMeans

        labels = KMeans(n_clusters=cfg.n_clusters, random_state=RANDOM_STATE,
                        n_init=10).fit_predict(x)
    elif cfg.algorithm == "agglomerative":
        from sklearn.cluster import AgglomerativeClustering

        labels = AgglomerativeClustering(n_clusters=cfg.n_clusters).fit_predict(x)
    elif cfg.algorithm == "umap_hdbscan":
        from sklearn.cluster import HDBSCAN

        reduced = _reduce_for_density(x, cfg)
        min_size = max(5, int(cfg.hdbscan_min_cluster_frac * len(x)))
        labels = HDBSCAN(min_cluster_size=min_size).fit_predict(reduced)
        was_noise = labels == -1
        if was_noise.all():
            raise ValueError("HDBSCAN found no clusters — loosen min_cluster_frac")
        cents = _centroids(reduced, labels)
        labels[was_noise] = _nearest_centroid(reduced[was_noise], cents)
    else:
        raise ValueError(f"unknown algorithm {cfg.algorithm!r}")

    labels = _merge_small(x, labels, cfg.min_export_size)
    return ClusterResult(labels=labels, was_noise=was_noise, centroids=_centroids(x, labels))
