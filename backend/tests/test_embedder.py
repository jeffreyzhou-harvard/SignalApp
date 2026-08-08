from app.retrieval import embedder as emb


def test_fake_embedder_returns_fixed_vector():
    e = emb.FakeEmbedder([1.0, 0.0, 0.0])
    assert e.embed("anything") == [1.0, 0.0, 0.0]
    assert e.name == "fake"


def test_get_embedder_none_without_key(monkeypatch):
    monkeypatch.setattr(emb.settings, "gemini_api_key", "")
    assert emb.get_embedder() is None


def test_get_embedder_returns_gemini_with_key(monkeypatch):
    monkeypatch.setattr(emb.settings, "gemini_api_key", "test-key")
    e = emb.get_embedder()
    assert isinstance(e, emb.GeminiEmbedder)
