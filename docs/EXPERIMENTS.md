# Layer B — Clustering Experiment Plan

*Owner: Jason. Scaffold lives in `ml/` (see `ml/README.md`); every run logs to `runs/results.csv` and writes a visual `report.html`.*

## Status: fast pass underway on fixture data

The full E1→E3 matrix runs **now** against Sam's 100 fixture personas (`backend/app/fixtures/personas.json`) with the local TF-IDF/SVD embedder — machinery shakeout + provisional winners. Two caveats that keep us honest: fixtures have planted tribes (metrics will look rosy), and the local embedder isn't the production one. When real ingest lands, the identical matrix re-runs with `--data <real> --embedder gemini` — same configs, same table, real conclusions. Grok labeling (`--labeler grok`) and the Gemini embedder switch on the moment `XAI_API_KEY` / `GEMINI_API_KEY` are set.

Fast-pass matrix (≈14 runs): E1 arms A–E (KMeans fixed) → E2 sparse weight {0, .2, .3, .4} on the E1 winner → E3 algorithms (KMeans k∈{5,8}, UMAP+HDBSCAN, agglomerative) on the E2 winner.

### Fast-pass results (fixture data — provisional until real ingest)

| Exp | Winner | Key numbers | Takeaway |
|---|---|---|---|
| E1 | **Arm C** (bio + posts + annotations) | stability .818, matches arm E with less input | Persona-card-only (D) showed the predicted homogenization trap: highest silhouette (.832), lowest stability (.711) — pretty LLM-phrasing blobs that don't survive resampling. Card text adds nothing over raw content. |
| E2 | **sparse 0.2** | stability .818 → .835 | Light annotation TF-IDF helps; ≥0.3 lets the sparse block dominate and stability degrades. |
| E3 | **UMAP+HDBSCAN** | stability **1.0**, silhouette .696, 6 clusters | Found a 6th tribe (data scientists) fixed-k was folding away. KMeans k=8 close (.926); agglomerative worst (.742). |

**Provisional default: arm C + sparse 0.2 + UMAP→HDBSCAN**, KMeans k=8 kept as fallback. Re-verify the full matrix on real ingest with the Gemini embedder before freezing — fixture tribes are planted, so real-data numbers will be lower and could reorder E2/E3.

### v3 round (engaged-with content + FT arm) — IN PROGRESS

Data upgrade landed first: 192/200 @ishand personas backfilled with `referenced_text` (parent bodies of posts they replied to / quoted / reposted — 1,553 parent tweets, ~$8). New ingests store it natively. Taxonomy re-scored with engaged evidence included.

**Standing rule (per team decision): every feature-representation change re-runs the full algorithm sweep** — KMeans k-sweep, UMAP+HDBSCAN, agglomerative. "KMeans wins" was a claim about discrete tag vectors, not a law; richer dense blocks (FT) may re-favor density methods. Tags-file reuse makes the sweep nearly free.

Results (baseline 0.542 = T4-vectors):

| Config | Stability | k |
|---|---|---|
| FT + KMeans | .447 | 8 |
| **FT + UMAP→HDBSCAN** | **.624** | 10 (+ periphery flag) |
| FT + agglomerative | .585 | 7 |
| F text-only + HDBSCAN | .595 | 2 (collapsed — taxonomy still needed) |

### v4 round (hierarchical taxonomy) + the variance discovery

| Run (repaired data) | Stability | k |
|---|---|---|
| v4r flat taxonomy (champion cfg re-run) | .238 | 3 |
| **v4br hierarchical + HDBSCAN** | **.660** | 5 |
| v4br tags + KMeans | .576 | 7 |

Two findings: **(1) hierarchical subdomain expansion posts the best number yet** (.660 > .624), splitting the dominant ai-ml mass into distinct engineer/creator/operator tribes. **(2) Fresh LLM scoring has high run-to-run variance** — the identical flat config scored .624 (v3) and .238 (v4r) on the same users, because each round re-derives the taxonomy at default temperature. Fix shipped: temperature pinned to 0.1 across derivation/scoring/labeling; v5 confirmation round validates. Also shipped: labeler rebuilt on durable evidence (tag mixes + roles + bios primary, recent posts secondary with an explicit no-current-events instruction) after v4 labels over-fit to Grokathon-week posts ("Grok Image Creators" ≠ a durable segment).

*(Ops note: v4's original numbers were discarded — a double-worker incident corrupted the input data; claim_next made atomic, data restored from snapshot. ~$70 of X budget lost to the runaway.)*

**referenced_text works: +15% stability**, and the algorithm ranking INVERTED — HDBSCAN went from collapsing on discrete tags (.046) to winning on the enriched dense block (.624), while KMeans dropped below baseline. The standing re-sweep rule caught it; without it we'd have shipped the worse config. Winner's tribes: ML Research Engineers, Agentic AI Devs, Open Source Contributors, SF Talent Network, Crypto VC Investors, Grok xAI Users, SpaceX/Tesla fans, + an honest periphery catch-all. Not yet activated in Neon (pending review — teammates consume the active run).

### Real-data results (@ishand, 200 deep-enriched, Gemini embedder) — CONFIRMED

| Config | Stability | Purity | k |
|---|---|---|---|
| A bios-only KMeans | .214 | .477 | 4 |
| C KMeans | .241 | .520 | 5 |
| E (+card) KMeans | **.155** | .492 | 4 |
| C KMeans s0.2 | .267 | .457 | 4 |
| C agglo s0.2 | .300 | .479 | 3 |
| **C HDBSCAN s0.2 → active run** | **.302** | .438 | 4+periphery |

### Representation v2 results (same audience, engagement-target + taxonomy features)

| Config | Stability | k | Notes |
|---|---|---|---|
| F: reply text dropped, HDBSCAN | .436 | 5 | filtering alone: +44% over baseline |
| T: taxonomy ⊕ bio ⊕ sparse, HDBSCAN | .046 | 2 | LLM scoring was excellent; **UMAP+HDBSCAN collapses on discrete tag vectors** |
| T: same features, KMeans | .481 | 3 | geometry fixed, clusters merged too far |
| **T3: KMeans k=8, min-export 12, Grok labels → active** | **.511** | **8** | AI Product Builders · AI Tooling Devs · SaaS Founders & Operators · Crypto & Tech Casuals · AI Agent Specialists · xAI & Multimodal Researchers · SpaceX & xAI Enthusiasts · AI Venture Investors |

Takeaways: (1) taxonomy features want KMeans, not density clustering — discrete low-dim vectors are not UMAP food; (2) "speedrun" was the a16z speedrun crowd, a real tribe, not noise — the taxonomy separated it; (3) per-user `tag_scores` + role now ship in each run's `tags.json` for the tag-lens UI; (4) next lift: Sam's `referenced_tweets` expansion feeds engaged-with content into scoring (arm F ⊕ T combined).

Every fixture-pass ordering held: C > A, sparse 0.2 helps, HDBSCAN wins, and card-in-embedding (E) is *worst* — homogenization confirmed empirically. E7 enrichment lift: +25% stability over bios-only. Absolute stability (~0.30) says this audience is soft-structured at n=200; levers before demo: bigger deep sample (enrichment is now concurrent), content-quality gate (cluster text-rich users, assign the rest), min_cluster_size tuning, and demo-account choice (a differentiated audience clusters better — testable in one command per candidate).

## Fixed decisions (don't re-litigate mid-experiment)

- **Embedder:** `gemini-embedding-001`, `task_type="CLUSTERING"`, dim 1536, vectors L2-normalized, cosine everywhere. (Day-one check: does the hackathon xAI key expose an embedding model? If yes, add it as one arm of E1 and keep everything else identical.)
- **Seeds fixed** (`RANDOM_STATE=42`) for UMAP/KMeans/bootstraps so runs are comparable.
- **Cache embeddings** keyed by `hash(embed_input)` — compositions re-embed only what changed.
- **Every run logs to one results table:** run id, composition, sparse weight, algorithm+params, n_clusters, % noise, stability ARI, annotation purity, LLM-judge score, silhouette, eyeball verdict (1–5), link to the run report (see Visualization).

## The harness (built on synthetic data before real data arrives)

1. **Stability ARI:** bootstrap 80% of users ×5, re-cluster, adjusted Rand index vs. full run. Real tribes survive resampling. Target ≥ 0.6.
2. **Annotation purity:** cross-tab clusters vs. dominant `context_annotations` domains. Clusters should roughly align with X's own topic tags.
3. **LLM judge:** for each cluster pair (cluster, nearest neighbor), show Grok 5+5 exemplars → "same audience segment or different?" % judged distinct = separation score.
4. **Eyeball test (final arbiter):** datamapplot 2D map + 10 exemplars per cluster — "would a marketer write different copy for these two groups?"

Silhouette is recorded but only breaks ties.

## Visualization (every run produces one, no exceptions)

Each run writes a self-contained **run report** (`runs/<run_id>/report.html`) so the eyeball test takes seconds, not a notebook session:

- **Audience map** — 2D UMAP projection (display projection, separate from the clustering-space reduction), points colored by cluster, sized by follower count, HDBSCAN-noise points hollow. Interactive (Plotly): hover shows avatar handle, bio, cluster label; click isolates a cluster. A static `datamapplot` version with label annotations doubles as the shareable/demo image.
- **Cluster size bar** — members per cluster with the exportable-minimum line drawn; anything under the line is flagged for merging.
- **Centroid similarity heatmap** — cluster × cluster cosine similarity; two hot off-diagonal cells = candidates the LLM judge should scrutinize.
- **Annotation purity heatmap** — cluster × context-annotation-domain; the visual form of harness metric 2.
- **Exemplar cards** — per cluster: label, persona card, 10 exemplar bios/posts inline.

Cross-run comparison visuals per experiment:

- **E1/E2/E3:** small-multiples grid of audience maps (one per arm, same display projection where feasible) + a metrics table row per arm — pick winners by looking, confirm with numbers.
- **E2:** line chart of stability/purity/separation vs. sparse weight.
- **E5:** confusion matrix (bio-only assignment vs. full-document cluster) + accuracy-vs-confidence-threshold curve, which visually locates the "core members" cutoff.
- **E6:** side-by-side map colored by embedding cluster vs. by Leiden community — agreement is visible before it's computed.

The per-run map doubles as the prototype for Person D's galaxy view — hand over the winning run's projection + `clusters.json` and the demo visualization is half-built.

## Experiment sequence

**E0 — Sanity (30 min).** Default composition (bio + 5 posts + card summary + interests), KMeans k=8. Purpose: pipeline works end-to-end on real data, map renders, labels generate. No tuning.

**E1 — Composition ablation (1–2 hr, the big one).** KMeans k=8 held fixed; vary `embed_input`:
| Arm | Composition |
|---|---|
| A | bio only |
| B | bio + raw posts |
| C | bio + raw posts + annotations |
| D | persona card only |
| E | full: bio + posts + annotations + card |

Hypothesis: C or E wins; D shows homogenization (low separation, high silhouette — the LLM-phrasing trap). Winner becomes the frozen composition.

**E2 — Dense + sparse fusion (1 hr).** Winning composition ⊕ TF-IDF block over `context_annotations` entities (+ mention-anchors if present). Sparse weight ∈ {0, 0.2, 0.3, 0.4}. Hypothesis: 0.2–0.3 beats dense-only on separation and purity.

**E3 — Algorithm shootout (1 hr).** On the E2 winner: KMeans k ∈ {6, 8, 10} vs. UMAP(10–15d, n_neighbors=30) → HDBSCAN min_cluster_size ∈ {2%, 3.5%, 5%} (noise → nearest centroid, flag kept) vs. agglomerative-ward k=8. Constraints: 5–10 clusters, none below exportable minimum (~100 members at 10k scale) after merging. Pick by harness; KMeans stays as fallback behind the same interface.

**E4 — Labeling quality (45 min).** On final clusters: contrastive labeling (all clusters' exemplars in one call) vs. independent per-cluster calls; exemplars = 5 centroid-near + 5 MMR-diverse vs. 10 centroid-near. Judge: do labels distinguish neighboring clusters without generic "tech enthusiast" mush?

**E5 — Tier-1 assignment (45 min).** Hold out 20% of deep-sample users, strip them to bio-only, assign via bio-embedding → nearest bio-centroid. Metric: agreement with their full-document cluster. Target ≥ 70%; report the confidence (distance-ratio) threshold where accuracy ≥ 85% — that threshold defines the "core members only" export option.

**E7 — Enrichment lift (runs on @ishand data the moment ingest lands).** Same 200 deep-sampled users, same algorithm: cluster on tier-1 features only (arm A, bios) vs. tier-2 features (arm C winner). Report the stability/separation delta + E5 assignment agreement. This is the "what the $20 enrichment pass buys" number — the empirical justification for the two-tier ingest design, and a judge-facing ROI line. Caveat to track: the current sampler is engagement-first but seed_engagement is zeroed (co-engage 403-skipped), so today's deep sample is ranked by follower count with no random stratum — ask Sam for ~70% ranked + 30% random before the next big ingest.

**E6 — Graph cross-check (stretch, needs co-engagement matrix).** Leiden communities on co-engagement graph vs. embedding clusters: ARI + cross-tab. Agreement ≥ 0.4 → the SimClusters judge line; disagreement → inspect whether graph splits any embedding cluster meaningfully.

## Stop rules

- E1/E2 winner unclear → prefer the simpler arm and move on; composition can swap late without breaking contracts.
- Total budget ~5–6 hrs. If behind at E3, freeze KMeans k=8 on best-known features and skip to E4 — labels and the map matter more to the demo than the last point of ARI.
- Deliverables downstream (clusters.json, persona cards, 2D coords) are insensitive to which arm wins. Ship whatever the harness says at freeze time.

## Lock-down (Aug 8, final night)

- **E6 skipped** (out of time) and **@ishand full-depth enrichment stopped mid-run** — its ~840 timeline fetches are raw-cached, so resuming later via `backend/scripts/enrich_all_direct.py` costs ~nothing. No re-cluster: **v5-active (stability 0.780, 5 tribes) is the frozen @ishand demo run.**
- @SpaceXAI engager ingest (job 5aaf848a) left running as the second demo entity; a 5-min heartbeat protects it from stale-requeue while any teammate worker is on pre-50e5057 code.
- Frontend galaxy reworked to match the 2D everyone-map: deep members at true UMAP positions, tier-1 in confidence-scaled constant-density discs, all tribes visible at once (focus dims instead of hiding), avatars stream in progressively, bubbles click through to X profiles.
- **SpaceXAI runs (key-bug lesson):** ml hardcoded `XAI_API_KEY` while the shared .env spells it `X_AI_API_KEY`; every Grok stage silently fell back to offline heuristics. spacexai-v1/v2 (degraded tags: core-only domains, all-enthusiast roles) scored **0.605–0.608**; spacexai-v3 with real taxonomy scored **0.832** (3 tribes, 8% noise: MAGA Conservatives / Space Exploration Builders / Generative AI Experimenters). Real taxonomy features are worth +0.22 ARI — and silent fallbacks hide config bugs; key access is now centralized in `config.xai_api_key()`. @ishand v5-active predates the mismatch and is verified genuine (derived domains, ai-ml subdomain pass, varied roles).
