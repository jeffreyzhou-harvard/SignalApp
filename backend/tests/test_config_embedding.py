from app.config import settings


def test_embedding_defaults_match_layer_b():
    assert settings.embedding_model == "gemini-embedding-001"
    assert settings.embedding_dim == 1536
    assert settings.embedding_task_type == "CLUSTERING"
    # key defaults empty (present only via env) — attribute must exist
    assert isinstance(settings.gemini_api_key, str)
