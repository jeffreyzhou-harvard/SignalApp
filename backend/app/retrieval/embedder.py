"""Query embedder — turns query text into a vector in Layer B's space.

The vector MUST match B's stored persona vectors (same model, dim, normalization,
task_type) or cosine comparison is meaningless. All knobs come from config.
`get_embedder()` returns None when unconfigured so callers report
`embeddings_not_ready` instead of crashing. Tests use FakeEmbedder — never network.
"""
from __future__ import annotations

import math
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


def get_embedder() -> Embedder | None:
    if not settings.gemini_api_key:
        return None
    return GeminiEmbedder()
