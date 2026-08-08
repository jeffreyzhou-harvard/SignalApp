from app.fixtures import generate
from app.models.persona import PersonaDocument, Cluster

def test_generated_personas_validate_and_mix_tiers():
    docs = generate.make_personas(n=100)
    assert len(docs) == 100
    assert all(isinstance(d, PersonaDocument) for d in docs)
    assert any(d.enrichment_tier == 2 for d in docs)
    assert any(d.enrichment_tier == 1 for d in docs)

def test_generated_clusters_have_profile_exemplars():
    docs = generate.make_personas(n=100)
    clusters = generate.make_clusters(docs)
    assert clusters and all(isinstance(c, Cluster) for c in clusters)
    assert clusters[0].exemplars and clusters[0].exemplars[0].handle
