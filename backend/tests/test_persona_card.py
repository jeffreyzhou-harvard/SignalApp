import threading
import time
from types import SimpleNamespace

from app.enrich import persona_card
from app.models.persona import Content, ContextAnnotation, PersonaCard


class _SleepyGrok:
    """Fake grok client shaped like the openai client. Sleeps per call and
    records the peak number of concurrent in-flight calls, so a test can prove
    the calls actually overlap instead of running serially."""

    def __init__(self, delay: float):
        self.delay = delay
        self._live = 0
        self.max_concurrent = 0
        self._lock = threading.Lock()
        self.beta = SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(parse=self._parse))
        )

    def _parse(self, *, model, messages, response_format):
        with self._lock:
            self._live += 1
            self.max_concurrent = max(self.max_concurrent, self._live)
        time.sleep(self.delay)
        with self._lock:
            self._live -= 1
        # Echo the user's bio into the card so callers can check ordering.
        bio_line = messages[1]["content"].split("\n", 1)[1].split("\n")[0]
        card = PersonaCard(
            archetype="engaged follower", one_liner=bio_line,
            ranked_interests=["x"], preferred_formats=["threads"],
            tone_affinity="neutral", conversion_levers=["value"], summary=bio_line,
        )
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=card))])


def test_generate_cards_concurrent_preserves_order_and_count():
    items = [(f"bio{i}", Content()) for i in range(5)]
    cards = persona_card.generate_cards_concurrent(items, client=None, concurrency=4)
    assert len(cards) == 5
    # client=None -> template cards; one_liner echoes the bio, so order is checkable
    assert [c.one_liner for c in cards] == ["bio0", "bio1", "bio2", "bio3", "bio4"]


def test_generate_cards_concurrent_runs_calls_in_parallel():
    fake = _SleepyGrok(delay=0.1)
    items = [(f"bio{i}", Content()) for i in range(8)]
    cards = persona_card.generate_cards_concurrent(items, client=fake, concurrency=4)
    assert len(cards) == 8
    assert fake.max_concurrent > 1              # actually parallel, not serial
    assert fake.max_concurrent <= 4             # bounded by the concurrency cap


def test_template_card_is_valid_without_network():
    content = Content(context_annotations=[ContextAnnotation(domain="Technology", entity="Rust", count=5)])
    card = persona_card.template_card("Rust dev, skeptical of hype", content)
    assert card.summary
    assert "Rust" in card.ranked_interests

def test_generate_card_falls_back_when_client_none():
    card = persona_card.generate_card("bio", Content(), client=None)
    assert card.archetype  # produced by fallback
