import json, pathlib, argparse
from app.models.persona import (PersonaDocument, Metrics, Content, ContextAnnotation,
                                PersonaCard, SamplePost, EngagementBreakdown, Cluster, ProfileCard)

_TRIBES = ["AI-skeptic engineers", "indie hackers", "growth marketers", "crypto builders",
           "design-first founders", "data scientists"]

def make_personas(n: int = 100) -> list[PersonaDocument]:
    docs = []
    for i in range(n):
        tribe = _TRIBES[i % len(_TRIBES)]
        tier = 2 if i % 5 else 1                      # ~80% tier-1
        base = dict(
            seed_account_id="demo", enrichment_tier=tier, user_id=f"u{i}",
            handle=f"@user{i}", display_name=f"User {i}", profile_url=f"https://x.com/user{i}",
            profile_image_url="https://img/x.png", account_age_days=100 + i, verified=(i % 7 == 0),
            bio=f"{tribe} · building things · post {i}",
            metrics=Metrics(followers_count=i * 13, following_count=50 + i,
                            tweet_count=i * 5, listed_count=i % 4),
        )
        if tier == 2:
            content = Content(
                sample_posts=[SamplePost(text=f"thoughts on {tribe} #{i}", type="original",
                                         created_at="2026-08-05T00:00:00Z",
                                         metrics=EngagementBreakdown(like=i, reply=1))],
                context_annotations=[ContextAnnotation(domain="Technology", entity=tribe, count=3)],
                avg_engagement=EngagementBreakdown(like=float(i)))
            card = PersonaCard(archetype=tribe, one_liner=f"A {tribe[:-1]}",
                               ranked_interests=[tribe, "startups"], preferred_formats=["threads"],
                               tone_affinity="candid", conversion_levers=["proof"],
                               summary=f"A member of {tribe}.")
            docs.append(PersonaDocument(**base, content=content, persona_card=card))
        else:
            docs.append(PersonaDocument(**base))
    return docs

def make_clusters(personas: list[PersonaDocument]) -> list[Cluster]:
    clusters = []
    for t, tribe in enumerate(_TRIBES):
        members = [d for d in personas if tribe in d.bio]
        if not members:
            continue
        exemplars = [ProfileCard(user_id=m.user_id, handle=m.handle, display_name=m.display_name,
                                 profile_url=m.profile_url, profile_image_url=m.profile_image_url,
                                 bio=m.bio, verified=m.verified,
                                 followers_count=m.metrics.followers_count) for m in members[:5]]
        clusters.append(Cluster(
            seed_account_id="demo", cluster_id=f"c-{t}", label=tribe,
            persona_card=next((m.persona_card for m in members if m.persona_card), None),
            size=len(members), share_of_audience=len(members) / max(1, len(personas)),
            engagement_index=0.5, exemplars=exemplars, member_ids=[m.user_id for m in members]))
    return clusters

def _write():
    out = pathlib.Path(__file__).parent
    docs = make_personas(100)
    (out / "personas.json").write_text(json.dumps([d.model_dump() for d in docs], indent=2))
    (out / "clusters.json").write_text(json.dumps([c.model_dump() for c in make_clusters(docs)], indent=2))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--write", action="store_true")
    if ap.parse_args().write:
        _write()
