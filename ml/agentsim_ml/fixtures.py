"""Synthetic PersonaDocuments with planted tribes, for pipeline dev before real
ingest data lands. Planted tribe = ground truth, so the harness can be smoke-
tested against a known answer (harness metrics should love these clusters)."""
from __future__ import annotations

import random

from .schema import PersonaDocument, Post

TRIBES = {
    "indie_hackers": {
        "bio_bits": ["building in public", "solo founder", "shipped 4 products", "MRR updates"],
        "post_bits": ["just crossed $2k MRR", "launch day! roast my landing page",
                      "stripe screenshot says it all", "indie hacking is a grind but worth it"],
        "annotations": ["Business/Entrepreneurship", "Technology/Web Development"],
        "mentions": ["@levelsio", "@marc_louvion"],
        "archetype": "indie hacker",
    },
    "ai_skeptic_engineers": {
        "bio_bits": ["staff engineer", "distributed systems", "rust", "show me the evals"],
        "post_bits": ["another agent framework, still no eval harness",
                      "benchmarks or it didn't happen", "p99 latency matters more than vibes",
                      "wrote a rust rewrite this weekend"],
        "annotations": ["Technology/Programming", "Software Development/Rust"],
        "mentions": ["@rustlang", "@github"],
        "archetype": "AI-skeptic staff engineer",
    },
    "growth_marketers": {
        "bio_bits": ["growth @ startup", "performance marketing", "CAC nerd", "newsletter 12k"],
        "post_bits": ["this hook 10x'd our CTR", "paid social is dead, long live creators",
                      "AB tested 14 subject lines so you don't have to", "funnel teardown thread"],
        "annotations": ["Business/Marketing", "Business/Advertising"],
        "mentions": ["@hubspot", "@lennysan"],
        "archetype": "growth marketer",
    },
    "ml_researchers": {
        "bio_bits": ["phd student", "ml research", "nlp", "opinions my own"],
        "post_bits": ["new paper on retrieval eval is underrated", "reviewer 2 strikes again",
                      "scaling laws hold up in our replication", "attention really is all you need"],
        "annotations": ["Science/Machine Learning", "Technology/Artificial Intelligence"],
        "mentions": ["@arxiv", "@neuripsconf"],
        "archetype": "ML researcher",
    },
    "design_founders": {
        "bio_bits": ["design engineer", "figma all day", "craft and taste", "ex-agency"],
        "post_bits": ["your onboarding has too many steps", "shipped a micro-interaction today",
                      "good design is invisible until it isn't", "typography opinions incoming"],
        "annotations": ["Technology/Design", "Business/Startups"],
        "mentions": ["@figma", "@framer"],
        "archetype": "design-minded founder",
    },
}


def make_fixtures(n: int = 100, tier1_frac: float = 0.0, seed: int = 42) -> list[PersonaDocument]:
    rng = random.Random(seed)
    docs = []
    tribe_names = list(TRIBES)
    for i in range(n):
        tribe_key = tribe_names[i % len(tribe_names)]
        t = TRIBES[tribe_key]
        bio = f"{rng.choice(t['bio_bits'])}. {rng.choice(t['bio_bits'])}."
        deep = rng.random() >= tier1_frac
        posts = (
            [Post(text=rng.choice(t["post_bits"]), mentions=list(t["mentions"]))
             for _ in range(6)]
            if deep else []
        )
        docs.append(PersonaDocument(
            user_id=f"synthetic_{i}",
            handle=f"@user{i}_{tribe_key[:5]}",
            display_name=f"User {i}",
            bio=bio,
            enrichment_tier=2 if deep else 1,
            followers_count=rng.randint(80, 20_000),
            posts=posts,
            annotations=list(t["annotations"]) if deep else [],
            persona_card={
                "archetype": t["archetype"],
                "summary": f"{t['archetype']} who posts about {tribe_key.replace('_', ' ')}.",
                "ranked_interests": [b for b in t["bio_bits"][:3]],
            } if deep else None,
        ))
    return docs


def ground_truth(docs: list[PersonaDocument]) -> list[str]:
    """Recover the planted tribe from the synthetic handle (fixtures only)."""
    return [d.handle.split("_")[-1] for d in docs]
