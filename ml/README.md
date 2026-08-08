# agentsim-ml — Layer B

Embedding → clustering → labeling → evaluation for AgentSim. See
`docs/EXPERIMENTS.md` for the experiment plan this implements.

## Setup

```bash
cd ml
uv sync            # core (offline-capable)
uv sync --extra gemini --extra dev   # + Gemini embedder + pytest
```

## Run

```bash
uv run agentsim-run --synthetic                      # E0 sanity on fixtures
uv run agentsim-run --synthetic --arm C --sparse 0.3 # E1/E2 arms
uv run agentsim-run --data ingest.json --embedder gemini --algo umap_hdbscan
open runs/<run_id>/report.html                       # the eyeball test
```

Every run appends to `runs/results.csv` and writes `runs/<id>/report.html`
(audience map, size bars, heatmaps, exemplar cards) plus `clusters.json` —
the contract the app consumes.

## Module map

| Module | Job |
|---|---|
| `schema.py` | tolerant parser for Sam's ingest schema (tier 1/2 aware) |
| `fixtures.py` | synthetic tribes with ground truth |
| `compose.py` | embed_input arms A–E (E1) |
| `embed.py` | Embedder interface: local TF-IDF/SVD, Gemini, xAI stub; cache |
| `sparse.py` | annotation/mention TF-IDF block + weighted fusion (E2) |
| `cluster.py` | KMeans / UMAP+HDBSCAN / agglomerative + product constraints (E3) |
| `label.py` | exemplar picking, heuristic + contrastive Grok labelers (E4) |
| `assign.py` | tier-1 bio-only assignment + confidence (E5) |
| `harness.py` | stability ARI, annotation purity, silhouette |
| `report.py` | per-run HTML report (the visualization layer) |
| `pipeline.py` | wiring; emits `clusters.json` |

Env: `GEMINI_API_KEY` for `--embedder gemini`, `XAI_API_KEY` for `--labeler grok`
(falls back to heuristic labels on any failure — a demo never dies on labeling).
