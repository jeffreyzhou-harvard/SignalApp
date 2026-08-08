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


def test_v2_posts_block_excludes_reply_text():
    from agentsim_ml.schema import Post

    doc = make_fixtures(5)[0]
    doc.posts = [
        Post(text="congrats on the launch!!", type="reply",
             referenced_text="Announcing our new AI eval harness for agents"),
        Post(text="deep dive on our rust rewrite", type="original"),
    ]
    out = compose(doc, "F")
    assert "congrats" not in out
    assert "rust rewrite" in out
    assert "eval harness" in out  # parent content surfaces as engagement evidence


def test_taxonomy_offline_heuristic_and_block():
    from agentsim_ml.taxonomy import derive_taxonomy, score_users, taxonomy_block

    docs = make_fixtures(20)
    tax = derive_taxonomy(docs)          # no XAI key in tests -> core domains
    tags = score_users(docs, tax)
    block = taxonomy_block(tags, tax)
    assert block.shape == (20, len(tax.domains) + 5)
    assert block.max() <= 1.0


def test_arm_T_pipeline_runs(tmp_path):
    from agentsim_ml.config import RunConfig
    from agentsim_ml.pipeline import run

    docs = make_fixtures(100)
    cfg = RunConfig(run_id="test-armT", composition="T", min_export_size=5,
                    stability_bootstraps=2, out_dir=tmp_path)
    res = run(cfg, docs)
    assert (tmp_path / "test-armT" / "tags.json").exists()
    assert res.scores.n_clusters >= 2
