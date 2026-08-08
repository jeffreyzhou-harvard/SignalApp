"""Tests for tier-1 assignment wiring (fix 1), the single-source cluster
aggregate/member builders (fix 3), and the single-centroid guard (fix 2)."""
import numpy as np

from agentsim_ml import contracts
from agentsim_ml.assign import assign
from agentsim_ml.cluster import run_clustering
from agentsim_ml.compose import compose
from agentsim_ml.config import RunConfig
from agentsim_ml.embed import LocalTfidfEmbedder
from agentsim_ml.fixtures import make_fixtures
from agentsim_ml.label import ClusterLabel


def _cfg(**kw) -> RunConfig:
    base = dict(run_id="t", min_export_size=5, stability_bootstraps=2)
    base.update(kw)
    return RunConfig(**base)


def _clustered(docs):
    deep = [d for d in docs if d.is_deep]
    x = LocalTfidfEmbedder().embed([compose(d, "E") for d in deep])
    result = run_clustering(x, _cfg(algorithm="kmeans", n_clusters=5))
    coords = np.random.default_rng(1).random((len(deep), 2)).astype(np.float32)
    return deep, x, result, coords


# ── Fix 2 ────────────────────────────────────────────────────────────────
def test_assign_handles_single_centroid():
    rng = np.random.default_rng(0)
    bio_x = rng.random((5, 4)).astype(np.float32)
    a = assign(bio_x, bio_x[:1])                 # one centroid: no 2nd-nearest
    assert a.labels.tolist() == [0] * 5
    assert a.confidence.shape == (5,)
    assert np.all(a.confidence == 1.0)


# ── Fix 1 ────────────────────────────────────────────────────────────────
def test_assign_tier1_places_every_shallow_user_in_a_real_cluster():
    docs = make_fixtures(120, tier1_frac=0.5)
    deep = [d for d in docs if d.is_deep]
    shallow = [d for d in docs if not d.is_deep]
    _, _, result, _ = _clustered(docs)
    labels, conf = contracts.assign_tier1(deep, shallow, result.labels, LocalTfidfEmbedder())
    assert len(labels) == len(shallow) == len(conf)
    assert set(int(v) for v in np.unique(labels)).issubset(set(int(v) for v in np.unique(result.labels)))
    assert np.all(conf >= 1.0)                    # confidence is a 2nd/1st distance ratio


def test_build_members_covers_deep_and_shallow_with_confidence():
    docs = make_fixtures(120, tier1_frac=0.5)
    deep = [d for d in docs if d.is_deep]
    shallow = [d for d in docs if not d.is_deep]
    _, _, result, coords = _clustered(docs)
    coords_2d = contracts._centroids_2d(coords, result.labels)
    labels, conf = contracts.assign_tier1(deep, shallow, result.labels, LocalTfidfEmbedder())
    members = contracts.build_members(deep, result, coords, shallow, labels, conf, coords_2d)
    assert {m.user_id for m in members} == {d.user_id for d in docs}   # nobody dropped
    deep_ids = {d.user_id for d in deep}
    for m in members:
        if m.user_id in deep_ids:
            assert m.confidence == 1.0
        else:
            assert m.confidence >= 1.0 and m.periphery is False


# ── Fix 3 (single source of aggregate truth) ───────────────────────────────
def test_build_aggregates_reflect_full_membership():
    docs = make_fixtures(120, tier1_frac=0.5)
    deep = [d for d in docs if d.is_deep]
    shallow = [d for d in docs if not d.is_deep]
    _, _, result, coords = _clustered(docs)
    coords_2d = contracts._centroids_2d(coords, result.labels)
    labels, conf = contracts.assign_tier1(deep, shallow, result.labels, LocalTfidfEmbedder())
    members = contracts.build_members(deep, result, coords, shallow, labels, conf, coords_2d)
    cluster_labels = [ClusterLabel(cluster_id=int(c), name=f"c{c}", one_liner="", keywords=[])
                      for c in np.unique(result.labels)]
    aggs = contracts.build_aggregates(deep, result, cluster_labels, coords, members)

    assert sum(a.size for a in aggs) == len(docs)                 # size == full audience
    assert abs(sum(a.share_of_audience for a in aggs) - 1.0) < 0.02
    agg_ids = sorted(uid for a in aggs for uid in a.member_ids)
    assert agg_ids == sorted(m.user_id for m in members)         # membership is consistent
    assert all(a.centroid and len(a.exemplar_idx) > 0 for a in aggs)
