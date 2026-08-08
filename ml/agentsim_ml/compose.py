"""embed_input composition — THE experimental knob of layer B (experiment E1).

Each arm is a subset of blocks; blocks render deterministically so embedding
caches key cleanly off the output text.
"""
from __future__ import annotations

from .config import COMPOSITION_ARMS
from .schema import PersonaDocument


def _block_bio(doc: PersonaDocument) -> str:
    return f"Bio: {doc.bio}" if doc.bio else ""


def _block_posts(doc: PersonaDocument, n: int) -> str:
    texts = [p.text for p in doc.posts[:n] if p.text]
    return "Recent posts:\n" + "\n".join(f"- {t}" for t in texts) if texts else ""


def _block_annotations(doc: PersonaDocument) -> str:
    return "Topics: " + ", ".join(doc.annotations) if doc.annotations else ""


def _block_card(doc: PersonaDocument) -> str:
    card = doc.persona_card
    if not card:
        return ""
    parts = [card.get("summary", ""), ", ".join(card.get("ranked_interests", []))]
    return "Persona: " + " | ".join(p for p in parts if p)


_BLOCKS = {
    "bio": lambda d, n: _block_bio(d),
    "posts": _block_posts,
    "annotations": lambda d, n: _block_annotations(d),
    "card": lambda d, n: _block_card(d),
}


def compose(doc: PersonaDocument, arm: str, n_posts: int = 6) -> str:
    blocks = COMPOSITION_ARMS[arm]
    rendered = [_BLOCKS[b](doc, n_posts) for b in blocks]
    return "\n".join(r for r in rendered if r)


def compose_bio_only(doc: PersonaDocument) -> str:
    """Tier-1 assignment path: bios are all we have for shallow users."""
    return compose(doc, "A")
