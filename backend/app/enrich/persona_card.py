from concurrent.futures import ThreadPoolExecutor

from app.config import settings
from app.models.persona import PersonaCard, Content

_SYSTEM = ("Summarize this X user into a persona card for launch targeting. "
           "Be concrete and grounded in their bio and posts.")


def template_card(bio: str, content: Content) -> PersonaCard:
    interests = [c.entity for c in sorted(content.context_annotations, key=lambda c: -c.count)][:6]
    if not interests:
        interests = [w for w in bio.replace(",", " ").split() if len(w) > 4][:4] or ["general"]
    return PersonaCard(
        archetype="engaged follower",
        one_liner=(bio[:120] or "An engaged member of the audience."),
        ranked_interests=interests,
        preferred_formats=["threads", "images"],
        tone_affinity="neutral",
        conversion_levers=["clear value", "social proof"],
        summary=f"Interested in {', '.join(interests)}. Bio: {bio[:200]}",
    )


def generate_card(bio: str, content: Content, client=None) -> PersonaCard:
    if client is None:
        return template_card(bio, content)
    try:
        posts = "\n".join(p.text for p in content.sample_posts[:8])
        topics = ", ".join(f"{c.entity}({c.count})" for c in content.context_annotations)
        completion = client.beta.chat.completions.parse(
            model=settings.grok_model,
            messages=[{"role": "system", "content": _SYSTEM},
                      {"role": "user", "content": f"BIO:\n{bio}\n\nTOPICS:\n{topics}\n\nPOSTS:\n{posts}"}],
            response_format=PersonaCard,
        )
        return completion.choices[0].message.parsed
    except Exception:
        return template_card(bio, content)


def generate_cards_concurrent(items, client=None, concurrency: int = 8) -> list[PersonaCard]:
    """Generate persona cards for many (bio, content) pairs concurrently.

    The Grok call inside `generate_card` is I/O-bound (network), so a thread
    pool overlaps the calls while the GIL is released on the socket. Results
    are returned in the same order as `items`; per-item failures already
    degrade to a template card inside `generate_card`.
    """
    if not items:
        return []
    workers = max(1, min(concurrency, len(items)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(lambda it: generate_card(it[0], it[1], client=client), items))
