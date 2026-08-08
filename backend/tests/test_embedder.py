from app.retrieval import embedder as emb


def test_fake_embedder_returns_fixed_vector():
    e = emb.FakeEmbedder([1.0, 0.0, 0.0])
    assert e.embed("anything") == [1.0, 0.0, 0.0]
    assert e.name == "fake"


def test_get_embedder_none_without_key(monkeypatch):
    monkeypatch.setattr(emb.settings, "gemini_api_key", "")
    assert emb.get_embedder() is None


def test_get_embedder_wraps_gemini_in_cache_with_key(monkeypatch):
    monkeypatch.setattr(emb.settings, "gemini_api_key", "test-key")
    e = emb.get_embedder()
    assert isinstance(e, emb.CachedEmbedder)
    assert isinstance(e.inner, emb.GeminiEmbedder)


class _Counter:
    """Counts underlying embed() calls so cache hits are observable."""
    name = "counter"

    def __init__(self):
        self.calls = 0

    def embed(self, text: str) -> list[float]:
        self.calls += 1
        return [float(len(text)), 0.0, 0.0]


def test_cached_embedder_caches_by_text():
    emb._QUERY_CACHE.clear()
    inner = _Counter()
    c = emb.CachedEmbedder(inner, maxsize=10)
    a = c.embed("hello")
    b = c.embed("hello")
    assert a == b and inner.calls == 1        # second call is a cache hit
    c.embed("world")
    assert inner.calls == 2                    # different text -> miss


def test_cached_embedder_lru_evicts():
    emb._QUERY_CACHE.clear()
    inner = _Counter()
    c = emb.CachedEmbedder(inner, maxsize=1)
    c.embed("a")
    c.embed("b")                               # evicts "a"
    c.embed("a")                               # miss again after eviction
    assert inner.calls == 3


def test_cached_embedder_returns_copy_not_shared_ref():
    emb._QUERY_CACHE.clear()
    c = emb.CachedEmbedder(_Counter(), maxsize=4)
    v = c.embed("x")
    v.append(999.0)                            # mutating the caller's copy...
    assert c.embed("x") == [1.0, 0.0, 0.0]     # ...must not corrupt the cache
