import numpy as np
import pytest

from agentsim_ml.cluster import run_clustering
from agentsim_ml.compose import compose
from agentsim_ml.config import RunConfig
from agentsim_ml.fixtures import ground_truth, make_fixtures
from agentsim_ml.schema import PersonaDocument
from agentsim_ml.sparse import fuse


def cfg(**kw) -> RunConfig:
    base = dict(run_id="test", min_export_size=5, stability_bootstraps=2)
    base.update(kw)
    return RunConfig(**base)


def test_compose_arms_differ():
    doc = make_fixtures(5)[0]
    texts = {arm: compose(doc, arm) for arm in "ABCDE"}
    assert texts["A"] and texts["A"] != texts["E"]
    assert "Bio:" in texts["E"] and "Persona:" in texts["E"]


def test_compose_tier1_never_touches_deep_fields():
    doc = make_fixtures(20, tier1_frac=1.0)[0]
    assert doc.enrichment_tier == 1
    assert compose(doc, "E") == compose(doc, "A")  # only bio renders


def test_from_ingest_tolerates_missing_content():
    doc = PersonaDocument.from_ingest({"user_id": 123, "handle": "@x", "bio": None})
    assert doc.user_id == "123" and doc.bio == "" and not doc.is_deep


def test_fuse_weights():
    d, s = np.eye(4, dtype=np.float32), np.ones((4, 2), dtype=np.float32)
    assert fuse(d, s, 0.0) is d
    fused = fuse(d, s, 0.3)
    assert fused.shape == (4, 6)


@pytest.mark.parametrize("algo", ["kmeans", "agglomerative", "umap_hdbscan"])
def test_clustering_recovers_planted_tribes(algo):
    from sklearn.metrics import adjusted_rand_score

    from agentsim_ml.embed import LocalTfidfEmbedder

    docs = make_fixtures(150)
    texts = [compose(d, "E") for d in docs]
    x = LocalTfidfEmbedder().embed(texts)
    result = run_clustering(x, cfg(algorithm=algo, n_clusters=5))
    assert (result.labels >= 0).all()  # no orphans, ever
    ari = adjusted_rand_score(ground_truth(docs), result.labels)
    assert ari > 0.5, f"{algo} failed to recover planted tribes (ARI={ari:.2f})"


def test_small_clusters_get_merged():
    rng = np.random.default_rng(0)
    x = np.vstack([rng.normal(0, 0.1, (50, 8)), rng.normal(5, 0.1, (3, 8))]).astype(np.float32)
    result = run_clustering(x, cfg(algorithm="kmeans", n_clusters=2, min_export_size=10))
    _, counts = np.unique(result.labels, return_counts=True)
    assert len(counts) <= 2
