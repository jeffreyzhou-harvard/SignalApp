from app.enrich import persona_card
from app.models.persona import Content, ContextAnnotation

def test_template_card_is_valid_without_network():
    content = Content(context_annotations=[ContextAnnotation(domain="Technology", entity="Rust", count=5)])
    card = persona_card.template_card("Rust dev, skeptical of hype", content)
    assert card.summary
    assert "Rust" in card.ranked_interests

def test_generate_card_falls_back_when_client_none():
    card = persona_card.generate_card("bio", Content(), client=None)
    assert card.archetype  # produced by fallback
