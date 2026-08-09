# Deploy Analytics — Design Spec

**Date:** 2026-08-08
**Status:** Approved, ready for implementation

## Goal

Add professional, PostHog/Vercel-grade analytics to the **Deploys** page (`/dashboard/deploys`)
that answers "this post did x% better." Layered story:

1. **Base layer** — per-post engagement dashboard from real X metrics (impressions, likes,
   reposts, replies, bookmarks, link clicks, profile clicks, engagement rate).
2. **Highlight layer** — for posts that came from a wind-tunnel simulation, a
   **predicted-vs-actual** callout comparing the sim's prediction to what actually happened.

Aesthetic: xAI / X — near-black canvas, existing CSS tokens, thin borders, monochrome + single
accent, tabular numerals, dependency-free inline-SVG charts. No charting library.

## Decisions (from brainstorming)

- **Core story:** Both / layered (performance dashboard + predicted-vs-actual callout).
- **Placement:** Enhance the existing Deploys page; detail view is a slide-in drawer (not a route).
- **Data depth:** Real X API, cached. Fetch `non_public_metrics,organic_metrics` under owner
  OAuth; fall back to `public_metrics`. TTL-gated to respect rate limits/cost.
- **Baseline for "x% better":** all three — rolling average, previous post, and the sim's prediction.
- **Trends:** snapshot + periodic history (sparklines from stored snapshots).
- **Sim persistence:** on Ship, persist the winning `SimResult` prediction and link it to the deploy.

## Data model (`src/lib/types.ts`)

- Extend `PostMetrics` with optional owner-only fields:
  `linkClicks?`, `profileClicks?`, `engagements?`, `engagementRate?` (number). Existing fields
  (`likes`, `reposts`, `replies`, `views`, `bookmarks`) stay required.
- New `DeployPrediction`:
  `{ winner: "A"|"B"; predictedLiftPct: number; confidencePct: number; driver: string;
     predictedEngagementRate: number; provider: string; agentCount: number; capturedAt: string }`.
- New `MetricSnapshot`: `{ deployId: string; capturedAt: string; metrics: PostMetrics }`.
- Extend `DeployedPost` with optional `prediction?: DeployPrediction`.
- New `DeployComparisons`:
  `{ engagementRate: number|null; vsRollingAvgPct: number|null; vsPreviousPct: number|null;
     predicted?: { predictedRate: number; actualRate: number; deltaPct: number } }`.
- New API response types: `DeployAnalytics = DeployedPost & { metrics: PostMetrics|null;
  trend: MetricSnapshot[]; comparisons: DeployComparisons }` and a `DeploysResponse`
  `{ live: boolean; deploys: DeployAnalytics[]; summary: DeploySummary }` where
  `DeploySummary = { totalImpressions: number; avgEngagementRate: number|null;
     bestDeployId: string|null; vsPreviousPeriodPct: number|null }`.

## Analytics module (`src/lib/analytics/`) — pure core, no I/O

Per CLAUDE.md ("core logic must not import I/O"):

- `compare.ts` — **pure functions**, fully unit-tested:
  - `postEngagementRate(metrics): number` — `(likes+reposts+replies+bookmarks)/views*100`,
    returns 0 when views is 0. Mirrors `simulation/types.ts:engagementRate`.
  - `rollingAverageRate(rates: number[]): number|null` — mean, null on empty.
  - `deltaVsRollingAvg(rate, others: number[]): number|null` — `(rate-avg)/avg*100`, null when
    no others or avg is 0.
  - `deltaVsPrevious(rate, prevRate: number|null): number|null` — null when no previous or prev 0.
  - `predictedVsActual(prediction, actualRate): { predictedRate, actualRate, deltaPct }|null`.
  - `buildSummary(deploys): DeploySummary`.
- `x-metrics.ts` — X API fetch + mapping. Requests `public_metrics,non_public_metrics,organic_metrics`
  with the owner Bearer token; maps to `PostMetrics`, computing `engagementRate`. If the richer
  fields are absent (public-only fallback / >30-day window), owner-only fields stay undefined.
  Exposes `fetchMetrics(token, ids): Promise<Record<string, PostMetrics>>`.

## Storage (`StorageAdapter` + `json-file.ts`)

- `recordDeploy(post)` — `post` already carries optional `prediction` (part of `DeployedPost`).
- New `appendMetricSnapshot(snapshot: MetricSnapshot): Promise<void>`.
- New `listMetricSnapshots(deployId: string): Promise<MetricSnapshot[]>` (chronological).
- JSON adapter stores snapshots at `data/metrics/<deployId>.json` (append array), mirroring the
  `messages/<projectId>.json` pattern. New `METRICS_DIR` constant + `ensureDirs` includes it.

## API

- **`/api/publish`** (`route.ts`): accept optional `prediction` in the request body; validate
  shape loosely; pass it into `recordDeploy`. `CampaignPanel.shipWinner` builds and sends it.
- **`/api/deploys`** (`route.ts`): orchestrates (no business logic inline):
  1. `listDeploys()`.
  2. TTL gate: for the newest ~100 deploys, if the latest snapshot is older than
     `METRICS_TTL_SECONDS` (env, default 300) and an owner token exists, call
     `x-metrics.fetchMetrics` and `appendMetricSnapshot` for each. Otherwise serve last snapshot.
  3. For each deploy: latest `metrics`, `trend` (snapshots), `comparisons` (via `compare.ts`).
  4. Compute `summary`. Return `DeploysResponse`.
  `live` = whether current owner metrics were available.

## UI (`src/components/`)

- **`DeploysHome.tsx`** (enhance): add a **summary strip** of stat cards (total impressions,
  avg engagement rate, best performer, vs-previous delta). Cards gain an engagement-rate badge +
  colored delta chip; sim-origin posts show a `Predicted +X% · Actual +Y%` pill. Clicking a card
  opens the detail drawer.
- **`analytics/Sparkline.tsx`** (new): dependency-free inline-SVG line/area sparkline from a
  number series. Presentational, no data fetching.
- **`analytics/StatCard.tsx`** (new): labelled metric + optional delta chip.
- **`analytics/DeltaChip.tsx`** (new): `+23%` / `-4%` pill, green/red/neutral by sign.
- **`DeployDetailDrawer.tsx`** (new): slide-in panel — full metric breakdown, sparkline trend
  from snapshots, and the predicted-vs-actual block. Reuses `Sparkline`/`StatCard`/`DeltaChip`.
- **`galaxy/CampaignPanel.tsx`** (`shipWinner`): build a `DeployPrediction` from `result` and
  include it in the `/api/publish` body.

## Testing (Vitest)

- `analytics/compare.test.ts` — every pure function incl. edge cases: zero views, single deploy
  (no rolling avg / no previous), missing prediction, div-by-zero baselines.
- `analytics/x-metrics.test.ts` — maps public-only and full owner responses; fallback when
  richer fields absent; batches ids.
- Storage snapshot round-trip + TTL/dedup gate (append then read; skip when fresh).

## Scope cuts (YAGNI)

No new sidebar page (enhance Deploys), no background cron (TTL-on-load builds the trend),
no promoted/ads metrics, no video-playback funnel yet, FastAPI backend untouched. All work is in
the Next.js app.

## Config

- `METRICS_TTL_SECONDS` (default `300`) — min seconds between X API metric refreshes. Add to
  `.env.example`.
