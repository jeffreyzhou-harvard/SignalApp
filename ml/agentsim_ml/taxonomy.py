"""Marketing taxonomy: derive per-audience domain vocabulary, score each user
against it with structured Grok calls, and build the taxonomy feature block.

LLM = structured extraction only (never prose into embeddings — arm-E lesson).
Falls back to a context-annotation heuristic offline so tests/dev never block.
"""
from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np

from .schema import PersonaDocument

CORE_DOMAINS = [
    "ai-ml", "dev-tools", "startups-founders", "investing-vc", "marketing-growth",
    "design", "crypto-web3", "consumer-social", "gaming", "science-research",
    "media-content", "fitness-health", "finance-fintech", "hardware-robotics",
    "education",
]
ROLES = ["builder", "operator", "investor", "creator", "enthusiast"]

XAI_URL = "https://api.x.ai/v1/chat/completions"
GROK_MODEL = "grok-4.3"


@dataclass
class Taxonomy:
    domains: list[str]
    roles: list[str] = field(default_factory=lambda: list(ROLES))


@dataclass
class UserTags:
    user_id: str
    tag_scores: dict[str, float]     # domain -> 0..1
    role: str
    evidence: list[str] = field(default_factory=list)


def _evidence_text(d: PersonaDocument, n_posts: int = 6) -> str:
    posts = [p.text for p in d.posts if p.type in ("original", "quote") and p.text][:n_posts]
    engaged = [p.referenced_text for p in d.posts if p.referenced_text][:n_posts]
    parts = [f"Bio: {d.bio}"]
    if d.annotations:
        parts.append("X topic tags: " + ", ".join(dict.fromkeys(d.annotations)))
    if posts:
        parts.append("Their posts:\n" + "\n".join(f"- {t}" for t in posts))
    if engaged:
        parts.append("Content they engage with:\n" + "\n".join(f"- {t}" for t in engaged))
    return "\n".join(parts)


def _grok(prompt: str, timeout: int = 90) -> dict:
    import requests

    resp = requests.post(
        XAI_URL,
        headers={"Authorization": f"Bearer {os.environ['XAI_API_KEY']}"},
        json={"model": GROK_MODEL,
              "messages": [{"role": "user", "content": prompt}],
              "response_format": {"type": "json_object"}},
        timeout=timeout,
    )
    resp.raise_for_status()
    return json.loads(resp.json()["choices"][0]["message"]["content"])


def derive_taxonomy(docs: list[PersonaDocument], max_extra: int = 20,
                    sample: int = 60) -> Taxonomy:
    """One corpus-level call: which marketing-relevant domains exist in THIS
    audience? Merged with the stable core; heuristic fallback offline."""
    if not os.environ.get("XAI_API_KEY"):
        return Taxonomy(domains=list(CORE_DOMAINS))
    step = max(1, len(docs) // sample)
    corpus = "\n---\n".join(_evidence_text(d, 3) for d in docs[::step][:sample])
    try:
        out = _grok(
            "You are building a marketing segmentation taxonomy for the audience "
            "below. Core domains already exist: " + ", ".join(CORE_DOMAINS) + ". "
            f"Propose up to {max_extra} ADDITIONAL kebab-case domain tags that are "
            "(a) clearly present in this audience, (b) useful for targeting a product "
            "launch, (c) not synonyms of core domains. Return JSON: "
            '{"extra_domains": ["..."]}\n\nAUDIENCE SAMPLE:\n' + corpus
        )
        extra = [t for t in out.get("extra_domains", []) if isinstance(t, str)][:max_extra]
        return Taxonomy(domains=CORE_DOMAINS + extra)
    except Exception:
        return Taxonomy(domains=list(CORE_DOMAINS))


def _score_prompt(tax: Taxonomy, evidence: str) -> str:
    return (
        "Score this X user against a marketing taxonomy. Judge ONLY substantive "
        "interest signal — ignore congratulations, cheering, and social pleasantries "
        "entirely. Weight what they engage with as much as what they write.\n"
        f"Domains: {', '.join(tax.domains)}\nRoles: {', '.join(tax.roles)}\n"
        'Return JSON: {"tag_scores": {"<domain>": 0.0-1.0, ... (only domains with '
        'score >= 0.2, max 6)}, "role": "<one role>", '
        '"evidence": ["<=2 short quotes that justify the top tags"]}\n\n'
        f"USER:\n{evidence}"
    )


def _heuristic_tags(d: PersonaDocument, tax: Taxonomy) -> UserTags:
    """Offline fallback: map context-annotation domains onto taxonomy tags."""
    text = (d.bio + " " + " ".join(d.annotations)).lower()
    scores = {t: 1.0 for t in tax.domains if t.split("-")[0] in text}
    return UserTags(d.user_id, scores or {}, role="enthusiast")


def score_users(docs: list[PersonaDocument], tax: Taxonomy,
                concurrency: int = 16) -> list[UserTags]:
    if not os.environ.get("XAI_API_KEY"):
        return [_heuristic_tags(d, tax) for d in docs]

    def one(d: PersonaDocument) -> UserTags:
        try:
            out = _grok(_score_prompt(tax, _evidence_text(d)))
            scores = {k: float(v) for k, v in (out.get("tag_scores") or {}).items()
                      if k in tax.domains and isinstance(v, (int, float))}
            role = out.get("role") if out.get("role") in tax.roles else "enthusiast"
            return UserTags(d.user_id, scores, role,
                            [str(e)[:200] for e in (out.get("evidence") or [])[:2]])
        except Exception:
            return _heuristic_tags(d, tax)

    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        return list(ex.map(one, docs))


def taxonomy_block(tags: list[UserTags], tax: Taxonomy,
                   role_weight: float = 0.5) -> np.ndarray:
    """Users × (domains + roles) matrix — the interpretable feature backbone."""
    dim = {t: i for i, t in enumerate(tax.domains)}
    m = np.zeros((len(tags), len(tax.domains) + len(tax.roles)), dtype=np.float32)
    for r, ut in enumerate(tags):
        for tag, score in ut.tag_scores.items():
            m[r, dim[tag]] = score
        if role_weight > 0 and ut.role in tax.roles:
            m[r, len(tax.domains) + tax.roles.index(ut.role)] = role_weight
    return m


DOMINANCE_THRESHOLD = 0.5   # a tag held (>=0.4) by more than half the users
SUBDOMAIN_SCORE_MIN = 0.4   # which users get rescored against subdomains


def detect_dominant(tags: list[UserTags], tax: Taxonomy,
                    coverage: float = DOMINANCE_THRESHOLD) -> list[str]:
    """Tags so widespread they carry no separating information (the '@ishand:
    everyone is ai-ml' problem). Those get a subdomain pass."""
    n = max(1, len(tags))
    out = []
    for dom in tax.domains:
        holders = sum(1 for t in tags if t.tag_scores.get(dom, 0) >= SUBDOMAIN_SCORE_MIN)
        if holders / n > coverage:
            out.append(dom)
    return out


def derive_subdomains(parent: str, docs: list[PersonaDocument],
                      max_subs: int = 10, sample: int = 40) -> list[str]:
    """One corpus call: subdomains of `parent` present in this audience.
    Returned namespaced as 'parent/child' so the block stays interpretable."""
    if not os.environ.get("XAI_API_KEY"):
        return []
    step = max(1, len(docs) // sample)
    corpus = "\n---\n".join(_evidence_text(d, 3) for d in docs[::step][:sample])
    try:
        out = _grok(
            f"Everyone in this audience shares the interest domain '{parent}', so it "
            "no longer separates them. Propose up to "
            f"{max_subs} kebab-case SUBDOMAINS of '{parent}' that are clearly present "
            "and would split this audience into distinct marketing segments. Return "
            'JSON: {"subdomains": ["..."]}\n\nAUDIENCE SAMPLE:\n' + corpus
        )
        return [f"{parent}/{s}" for s in out.get("subdomains", [])
                if isinstance(s, str)][:max_subs]
    except Exception:
        return []


def hierarchical_expand(docs: list[PersonaDocument], tax: Taxonomy,
                        tags: list[UserTags]) -> tuple[Taxonomy, list[UserTags]]:
    """For each dominant tag: derive subdomains, rescore its holders against
    them, merge namespaced scores. No-op offline or when nothing dominates."""
    dominant = detect_dominant(tags, tax)
    if not dominant or not os.environ.get("XAI_API_KEY"):
        return tax, tags
    by_uid = {t.user_id: t for t in tags}
    doc_by_uid = {d.user_id: d for d in docs}
    for parent in dominant:
        holders = [t for t in tags if t.tag_scores.get(parent, 0) >= SUBDOMAIN_SCORE_MIN]
        holder_docs = [doc_by_uid[t.user_id] for t in holders if t.user_id in doc_by_uid]
        subs = derive_subdomains(parent, holder_docs)
        if not subs:
            continue
        sub_tax = Taxonomy(domains=subs)
        sub_scores = score_users(holder_docs, sub_tax)
        for st in sub_scores:
            by_uid[st.user_id].tag_scores.update(st.tag_scores)
        tax.domains.extend(subs)
    return tax, list(by_uid.values())


def load_tags(path) -> tuple[Taxonomy, list[UserTags]]:
    """Reuse a prior run's tags.json — geometry experiments are then Grok-free."""
    d = json.loads(open(path).read())
    tax = Taxonomy(domains=d["domains"])
    tags = [UserTags(u["user_id"], u["tag_scores"], u["role"], u.get("evidence", []))
            for u in d["users"]]
    return tax, tags


def strip_first_pc(m: np.ndarray) -> np.ndarray:
    """Remove the audience-wide shared component (e.g. 'everyone is ai-ml') so
    subdomain differences carry the geometry."""
    centered = m - m.mean(axis=0, keepdims=True)
    u, s, vt = np.linalg.svd(centered, full_matrices=False)
    return (centered - np.outer(u[:, 0] * s[0], vt[0])).astype(np.float32)
