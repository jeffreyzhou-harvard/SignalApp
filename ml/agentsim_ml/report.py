"""Self-contained HTML run report: audience map, size bars, similarity + purity
heatmaps, exemplar cards. One file per run; open it, eyeball it, log a verdict.

Viz notes (dataviz method): categorical colors use the validated reference
palette in fixed slot order, never cycled — clusters past 8 fold into a muted
'Other'. Scatter is an all-pairs context where the 8-slot palette can't fully
separate under CVD, so identity never rides on color alone: every cluster gets
a direct label at its centroid plus the legend. Heatmaps are single-hue
sequential (blue). The report deliberately commits to a light theme (internal
dev tool) — surface and inks are painted explicitly.
"""
from __future__ import annotations

import html
from pathlib import Path

import numpy as np

from .label import ClusterLabel, pick_exemplars
from .schema import PersonaDocument

# Reference palette, light mode, fixed slot order (validated — see dataviz skill)
CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100",
               "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
OTHER = "#898781"
SURFACE, PAGE = "#fcfcfb", "#f9f9f7"
INK, INK2, MUTED, GRID, BASELINE = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]

_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'


def _color(cid: int) -> str:
    return CATEGORICAL[cid] if cid < len(CATEGORICAL) else OTHER


def _layout(fig, title: str, height: int = 420):
    fig.update_layout(
        title=dict(text=title, font=dict(family=_FONT, size=15, color=INK)),
        font=dict(family=_FONT, size=12, color=INK2),
        paper_bgcolor=SURFACE, plot_bgcolor=SURFACE, height=height,
        margin=dict(l=50, r=20, t=48, b=40),
        legend=dict(font=dict(color=INK2)),
    )
    fig.update_xaxes(gridcolor=GRID, zerolinecolor=BASELINE, linecolor=BASELINE)
    fig.update_yaxes(gridcolor=GRID, zerolinecolor=BASELINE, linecolor=BASELINE)
    return fig


def display_projection(x: np.ndarray) -> np.ndarray:
    """2D projection for DISPLAY ONLY — clustering never runs on these coords."""
    try:
        from umap import UMAP

        return UMAP(n_components=2, n_neighbors=min(30, len(x) - 1),
                    metric="cosine", random_state=42).fit_transform(x)
    except ImportError:
        from sklearn.decomposition import PCA

        return PCA(n_components=2, random_state=42).fit_transform(x)


def _audience_map(coords, docs, labels, was_noise, cluster_labels):
    import plotly.graph_objects as go

    fig = go.Figure()
    names = {cl.cluster_id: cl.name for cl in cluster_labels}
    sizes = np.clip(np.log1p([d.followers_count for d in docs]) * 2.2, 5, 16)
    for cid in np.unique(labels):
        m = labels == cid
        fig.add_trace(go.Scatter(
            x=coords[m, 0], y=coords[m, 1], mode="markers",
            name=f"{cid}: {names.get(cid, '?')}",
            marker=dict(
                color=_color(int(cid)), size=sizes[m],
                line=dict(width=np.where(was_noise[m], 1.5, 0.5).mean(),
                          color=SURFACE),
                symbol=["circle-open" if n else "circle" for n in was_noise[m]],
            ),
            text=[f"{d.handle}<br>{html.escape(d.bio[:120])}" for d, mm in zip(docs, m) if mm],
            hovertemplate="%{text}<extra>" + names.get(cid, "") + "</extra>",
        ))
        cx, cy = coords[m, 0].mean(), coords[m, 1].mean()
        fig.add_annotation(x=cx, y=cy, text=f"<b>{names.get(cid, cid)}</b>",
                           showarrow=False, font=dict(size=12, color=INK),
                           bgcolor="rgba(252,252,251,0.75)")
    fig.update_xaxes(visible=False)
    fig.update_yaxes(visible=False)
    return _layout(fig, "Audience map (display projection — hollow = HDBSCAN periphery)", 560)


def _size_bar(labels, cluster_labels, min_export: int):
    import plotly.graph_objects as go

    ids, counts = np.unique(labels, return_counts=True)
    names = {cl.cluster_id: cl.name for cl in cluster_labels}
    fig = go.Figure(go.Bar(
        x=[f"{i}: {names.get(int(i), '')}" for i in ids], y=counts,
        marker=dict(color=[_color(int(i)) for i in ids]),
        text=counts, textposition="outside",
    ))
    fig.add_hline(y=min_export, line=dict(color=INK2, dash="dot"),
                  annotation_text=f"exportable minimum ({min_export})",
                  annotation_font_color=INK2)
    return _layout(fig, "Cluster sizes", 340)


def _heatmap(z, x_labels, y_labels, title):
    import plotly.graph_objects as go

    fig = go.Figure(go.Heatmap(
        z=z, x=x_labels, y=y_labels, colorscale=[[i / 6, c] for i, c in enumerate(SEQ)],
        hovertemplate="%{y} × %{x}: %{z:.2f}<extra></extra>",
    ))
    return _layout(fig, title, 360)


def _centroid_similarity(centroids, cluster_labels):
    names = [f"{cl.cluster_id}: {cl.name}" for cl in sorted(cluster_labels, key=lambda c: c.cluster_id)]
    c = centroids / np.linalg.norm(centroids, axis=1, keepdims=True)
    sim = c @ c.T
    np.fill_diagonal(sim, np.nan)
    return _heatmap(np.round(sim, 2), names, names,
                    "Centroid cosine similarity (hot off-diagonal = judge these pairs)")


def _purity_heatmap(docs, labels, cluster_labels):
    names = {cl.cluster_id: cl.name for cl in cluster_labels}
    domains = sorted({d.annotations[0].split("/")[0] for d in docs if d.annotations})
    if not domains:
        return None
    ids = np.unique(labels)
    z = np.zeros((len(ids), len(domains)))
    for r, cid in enumerate(ids):
        members = [docs[i] for i in np.where(labels == cid)[0]]
        tagged = [m.annotations[0].split("/")[0] for m in members if m.annotations]
        for c, dom in enumerate(domains):
            z[r, c] = tagged.count(dom) / len(tagged) if tagged else 0
    return _heatmap(np.round(z, 2), domains,
                    [f"{int(i)}: {names.get(int(i), '')}" for i in ids],
                    "Annotation purity (cluster × X context-annotation domain)")


def _exemplar_cards(docs, x, labels, centroids, cluster_labels) -> str:
    cards = []
    for cl in sorted(cluster_labels, key=lambda c: c.cluster_id):
        idx = pick_exemplars(x, labels, centroids, cl.cluster_id, n_near=5, n_diverse=5)
        rows = "".join(
            f"<li><b>{html.escape(docs[i].handle)}</b> — {html.escape(docs[i].bio[:160])}"
            + (f"<br><i>“{html.escape(docs[i].posts[0].text[:140])}”</i>" if docs[i].posts else "")
            + "</li>"
            for i in idx
        )
        cards.append(
            f'<div class="card"><h3><span class="dot" style="background:{_color(cl.cluster_id)}"></span>'
            f"{cl.cluster_id}: {html.escape(cl.name)}</h3>"
            f"<p>{html.escape(cl.one_liner)} · keywords: {html.escape(', '.join(cl.keywords))}</p>"
            f"<ul>{rows}</ul></div>"
        )
    return "\n".join(cards)


def write_report(out: Path, cfg, docs: list[PersonaDocument], x: np.ndarray,
                 labels: np.ndarray, was_noise: np.ndarray, centroids: np.ndarray,
                 cluster_labels: list[ClusterLabel], scores) -> Path:
    import plotly.io as pio

    coords = display_projection(x)
    figs = [
        _audience_map(coords, docs, labels, was_noise, cluster_labels),
        _size_bar(labels, cluster_labels, cfg.min_export_size),
        _centroid_similarity(centroids, cluster_labels),
    ]
    purity = _purity_heatmap(docs, labels, cluster_labels)
    if purity is not None:
        figs.append(purity)

    fig_html = [
        pio.to_html(f, include_plotlyjs="inline" if i == 0 else False, full_html=False)
        for i, f in enumerate(figs)
    ]
    metrics = " · ".join(f"{k}: {v}" for k, v in scores.to_row().items())
    body = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>run {cfg.run_id}</title>
<style>
  body {{ background:{PAGE}; color:{INK}; font-family:{_FONT}; margin:0; padding:24px; }}
  .wrap {{ max-width:1080px; margin:0 auto; display:flex; flex-direction:column; gap:20px; }}
  header h1 {{ font-size:18px; margin:0; }}
  header p {{ color:{INK2}; margin:4px 0 0; font-variant-numeric: tabular-nums; }}
  .panel {{ background:{SURFACE}; border:1px solid rgba(11,11,11,0.10); border-radius:8px;
           padding:8px; overflow-x:auto; }}
  .card {{ background:{SURFACE}; border:1px solid rgba(11,11,11,0.10); border-radius:8px;
          padding:14px 18px; }}
  .card h3 {{ margin:0 0 4px; font-size:14px; }}
  .card p {{ color:{INK2}; margin:0 0 8px; font-size:13px; }}
  .card ul {{ margin:0; padding-left:18px; font-size:13px; color:{INK2}; }}
  .card li {{ margin-bottom:6px; }}
  .dot {{ display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; }}
</style></head><body><div class="wrap">
<header><h1>AgentSim run report — {cfg.run_id}</h1>
<p>composition {cfg.composition} · embedder {cfg.embedder} · sparse {cfg.sparse_weight} ·
{cfg.algorithm} · {metrics}</p></header>
{''.join(f'<div class="panel">{h}</div>' for h in fig_html)}
<h2 style="margin:8px 0 0; font-size:16px;">Exemplars</h2>
{_exemplar_cards(docs, x, labels, centroids, cluster_labels)}
</div></body></html>"""
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(body)
    return out
