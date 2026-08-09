"""Embedder interface + implementations.

- LocalTfidfEmbedder: offline default (TF-IDF -> SVD). Real signal on real text,
  zero network — dev/fixtures run anywhere.
- GeminiEmbedder: gemini-embedding-001 with task_type=CLUSTERING (plan of record
  for real data; needs GEMINI_API_KEY and `uv sync --extra gemini`).
- XAIEmbedder: stub — day-one check whether the hackathon key exposes one.

All return L2-normalized float32 arrays. A JSON file cache keys on
sha256(model + text) so composition experiments only re-embed what changed.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Protocol

import numpy as np


class Embedder(Protocol):
    name: str

    def embed(self, texts: list[str]) -> np.ndarray: ...


def _normalize(m: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (m / norms).astype(np.float32)


class LocalTfidfEmbedder:
    name = "local-tfidf-svd"

    def __init__(self, dim: int = 256, random_state: int = 42):
        self.dim = dim
        self.random_state = random_state

    def embed(self, texts: list[str]) -> np.ndarray:
        from sklearn.decomposition import TruncatedSVD
        from sklearn.feature_extraction.text import TfidfVectorizer

        tfidf = TfidfVectorizer(max_features=8192, sublinear_tf=True).fit_transform(texts)
        dim = min(self.dim, tfidf.shape[1] - 1, len(texts) - 1)
        svd = TruncatedSVD(n_components=max(dim, 2), random_state=self.random_state)
        return _normalize(svd.fit_transform(tfidf))


class GeminiEmbedder:
    name = "gemini-embedding-001"

    def __init__(self, task_type: str = "CLUSTERING", dim: int = 1536, batch: int = 100):
        self.task_type, self.dim, self.batch = task_type, dim, batch

    def embed(self, texts: list[str]) -> np.ndarray:
        import time

        from google import genai
        from google.genai import errors, types

        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        # Gemini rejects empty content parts; blank docs get a neutral placeholder
        texts = [t if t.strip() else "(no profile text)" for t in texts]
        out: list[list[float]] = []
        for i in range(0, len(texts), self.batch):
            for attempt in range(6):
                try:
                    resp = client.models.embed_content(
                        model="gemini-embedding-001",
                        contents=texts[i : i + self.batch],
                        config=types.EmbedContentConfig(
                            task_type=self.task_type, output_dimensionality=self.dim
                        ),
                    )
                    break
                except errors.ClientError as e:
                    # free-tier RPM quota: respect the server's retry hint
                    if e.code != 429 or attempt == 5:
                        raise
                    time.sleep(65)
            out.extend(e.values for e in resp.embeddings)
        return _normalize(np.array(out))


class CachedEmbedder:
    def __init__(self, inner: Embedder, cache_dir: Path = Path(".embed_cache")):
        self.inner = inner
        self.name = inner.name
        self.cache_dir = cache_dir
        cache_dir.mkdir(parents=True, exist_ok=True)

    def _key(self, text: str) -> str:
        return hashlib.sha256(f"{self.name}::{text}".encode()).hexdigest()

    def embed(self, texts: list[str]) -> np.ndarray:
        keys = [self._key(t) for t in texts]
        paths = [self.cache_dir / f"{k}.json" for k in keys]
        missing = [i for i, p in enumerate(paths) if not p.exists()]
        if missing:
            fresh = self.inner.embed([texts[i] for i in missing])
            for i, vec in zip(missing, fresh):
                paths[i].write_text(json.dumps(vec.tolist()))
        return np.array([json.loads(p.read_text()) for p in paths], dtype=np.float32)


def get_embedder(name: str, cache_dir: Path | None = None) -> Embedder:
    inner: Embedder
    if name == "gemini":
        inner = GeminiEmbedder()
    elif name == "xai":
        raise NotImplementedError(
            "Check `curl https://api.x.ai/v1/models` with the hackathon key first; "
            "wire up here if an embedding model is exposed."
        )
    else:
        return LocalTfidfEmbedder()  # corpus-dependent -> caching would be wrong
    return CachedEmbedder(inner, cache_dir or Path(".embed_cache"))
