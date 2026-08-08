"""Tier-1 assignment (experiment E5): bio-only users -> nearest bio-centroid,
with a confidence score that defines the 'core members only' export cut.

Bio-centroids are computed from the deep sample's *bio* embeddings (not the
full-document ones) so shallow and deep users live in the same space.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Assignment:
    labels: np.ndarray
    confidence: np.ndarray  # dist ratio 2nd-nearest/nearest; higher = surer (>=1)


def bio_centroids(bio_x_deep: np.ndarray, deep_labels: np.ndarray) -> np.ndarray:
    ids = np.unique(deep_labels)
    return np.vstack([bio_x_deep[deep_labels == i].mean(axis=0) for i in ids])


def assign(bio_x: np.ndarray, centroids: np.ndarray) -> Assignment:
    dists = np.linalg.norm(bio_x[:, None, :] - centroids[None, :, :], axis=2)
    nearest = dists.argmin(axis=1)
    if centroids.shape[0] < 2:
        # one cluster: everyone belongs to it, the 2nd/1st ratio is undefined -> 1.0
        return Assignment(labels=nearest, confidence=np.ones(len(bio_x)))
    order = np.argsort(dists, axis=1)
    d1 = dists[np.arange(len(bio_x)), order[:, 0]]
    d2 = dists[np.arange(len(bio_x)), order[:, 1]]
    conf = np.divide(d2, d1, out=np.ones_like(d1), where=d1 > 0)
    return Assignment(labels=order[:, 0], confidence=conf)
