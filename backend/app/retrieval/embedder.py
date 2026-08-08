"""Query embedder — turns query text into a vector in Layer B's space.

The vector MUST match B's stored persona vectors (same model, dim, normalization,
task_type) or cosine comparison is meaningless. All knobs come from config.
`get_embedder()` returns None when unconfigured so callers report
`embeddings_not_ready` instead of crashing. Tests use FakeEmbedder — never network.
"""
from __future__ import annotations

import math
from collections import OrderedDict
from typing import Protocol

from app.config import settings


class Embedder(Protocol):
    name: str

    def embed(self, text: str) -> list[float]: ...


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


class FakeEmbedder:
    """Deterministic, offline. For tests only."""

    name = "fake"

    def __init__(self, vec: list[float]):
        self._vec = list(vec)

    def embed(self, text: str) -> list[float]:
        return list(self._vec)


class GeminiEmbedder:
    """gemini-embedding-001, matching Layer B. Imports google-genai lazily so the
    module (and the whole app) loads without the extra installed / key present."""

    name = "gemini-embedding-001"

    def embed(self, text: str) -> list[float]:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.gemini_api_key)
        resp = client.models.embed_content(
            model=settings.embedding_model,
            contents=[text],
            config=types.EmbedContentConfig(
                task_type=settings.embedding_task_type,
                output_dimensionality=settings.embedding_dim,
            ),
        )
        return _l2_normalize(list(resp.embeddings[0].values))


# Module-level so the LRU survives across per-call get_embedder() instances (the
# search tool builds a fresh wrapper each call). A query embedding is a pure
# function of (model, dim, task_type, text) — cache hits are always correct; the
# LRU only bounds memory and skips the paid, rate-limited Gemini call.
_QUERY_CACHE: "OrderedDict[tuple, list[float]]" = OrderedDict()


class CachedEmbedder:
    """Wraps an embedder with a bounded, process-wide LRU keyed on the full
    embedding-space identity plus the query text."""

    def __init__(self, inner: Embedder, maxsize: int = 512):
        self.inner = inner
        self.name = inner.name
        self.maxsize = max(1, maxsize)

    def _key(self, text: str) -> tuple:
        return (self.name, settings.embedding_dim, settings.embedding_task_type, text)

    def embed(self, text: str) -> list[float]:
        key = self._key(text)
        hit = _QUERY_CACHE.get(key)
        if hit is not None:
            _QUERY_CACHE.move_to_end(key)
            return list(hit)
        vec = self.inner.embed(text)
        _QUERY_CACHE[key] = vec
        _QUERY_CACHE.move_to_end(key)
        while len(_QUERY_CACHE) > self.maxsize:
            _QUERY_CACHE.popitem(last=False)
        return list(vec)


def get_embedder() -> Embedder | None:
    if not settings.gemini_api_key:
        return None
    return CachedEmbedder(GeminiEmbedder(), settings.embedding_cache_size)
