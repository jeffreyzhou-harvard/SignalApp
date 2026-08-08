"""Sparse feature block (experiment E2): TF-IDF over context_annotations and
mention anchors, fused with the dense embedding by weighted concatenation.

Both blocks are L2-normalized before weighting so `sparse_weight` means what it
says regardless of dimensionality.
"""
from __future__ import annotations

import numpy as np

from .schema import PersonaDocument


def sparse_features(docs: list[PersonaDocument], max_features: int = 512) -> np.ndarray:
    from sklearn.feature_extraction.text import TfidfVectorizer

    corpus = [
        " ".join(d.annotations)
        + " "
        + " ".join(m for p in d.posts for m in p.mentions)
        for d in docs
    ]
    if not any(corpus):
        return np.zeros((len(docs), 1), dtype=np.float32)
    vec = TfidfVectorizer(
        max_features=max_features, token_pattern=r"[^\s]+", lowercase=True
    )
    return np.asarray(vec.fit_transform(corpus).todense(), dtype=np.float32)


def fuse(dense: np.ndarray, sparse: np.ndarray, sparse_weight: float) -> np.ndarray:
    if sparse_weight <= 0:
        return dense

    def norm(m: np.ndarray) -> np.ndarray:
        n = np.linalg.norm(m, axis=1, keepdims=True)
        n[n == 0] = 1.0
        return m / n

    return np.hstack([
        (1.0 - sparse_weight) * norm(dense),
        sparse_weight * norm(sparse),
    ]).astype(np.float32)
