/**
 * Pure comparison math for deploy analytics — no I/O. The engagement rate
 * mirrors src/lib/simulation/types.ts:engagementRate.
 *
 * Every function here is a total, side-effect-free transform over plain data:
 * given the same inputs it returns the same outputs, imports nothing external,
 * and rounds nothing (the UI formats). This keeps the deploy-analytics math
 * testable and swappable independent of storage, network, or React.
 */

import type { DeployComparisons, DeployPrediction, DeploySummary, PostMetrics } from "../types";

/**
 * A post's engagement rate as a percent: (likes+reposts+replies+bookmarks)/views*100.
 * Computed fresh from raw counts (authoritative — ignores any cached
 * metrics.engagementRate). Returns 0 when views is 0 to avoid div-by-zero.
 */
export function postEngagementRate(metrics: PostMetrics): number {
  if (metrics.views === 0) return 0;
  const interactions = metrics.likes + metrics.reposts + metrics.replies + metrics.bookmarks;
  return (interactions / metrics.views) * 100;
}

/** Arithmetic mean of the rates, or null for an empty array. */
export function rollingAverageRate(rates: number[]): number | null {
  if (rates.length === 0) return null;
  const sum = rates.reduce((acc, r) => acc + r, 0);
  return sum / rates.length;
}

/**
 * Percent difference of `rate` vs the rolling average of `otherRates`.
 * Null when otherRates is empty or its average is 0.
 */
export function deltaVsRollingAvg(rate: number, otherRates: number[]): number | null {
  const avg = rollingAverageRate(otherRates);
  if (avg === null || avg === 0) return null;
  return ((rate - avg) / avg) * 100;
}

/**
 * Percent difference of `rate` vs the previous deploy's rate.
 * Null when prevRate is null or 0.
 */
export function deltaVsPrevious(rate: number, prevRate: number | null): number | null {
  if (prevRate === null || prevRate === 0) return null;
  return ((rate - prevRate) / prevRate) * 100;
}

/**
 * How the shipped prediction compared to the live rate. Null when there's no
 * prediction. deltaPct is 0 when the predicted rate is 0 (avoid div-by-zero).
 */
export function predictedVsActual(
  prediction: DeployPrediction | null | undefined,
  actualRate: number,
): { predictedRate: number; actualRate: number; deltaPct: number } | null {
  if (!prediction) return null;
  const predictedRate = prediction.predictedEngagementRate;
  const deltaPct = predictedRate === 0 ? 0 : ((actualRate - predictedRate) / predictedRate) * 100;
  return { predictedRate, actualRate, deltaPct };
}

/** Assemble the full comparison bundle for a single deploy. */
export function buildComparisons(args: {
  metrics: PostMetrics | null;
  prediction?: DeployPrediction | null;
  otherRates: number[];
  prevRate: number | null;
}): DeployComparisons {
  const { metrics, prediction, otherRates, prevRate } = args;
  if (metrics === null) {
    return { engagementRate: null, vsRollingAvgPct: null, vsPreviousPct: null };
  }
  const rate = postEngagementRate(metrics);
  const comparisons: DeployComparisons = {
    engagementRate: rate,
    vsRollingAvgPct: deltaVsRollingAvg(rate, otherRates),
    vsPreviousPct: deltaVsPrevious(rate, prevRate),
  };
  const predicted = predictedVsActual(prediction, rate);
  if (predicted !== null) comparisons.predicted = predicted;
  return comparisons;
}

/**
 * Top-of-page rollup across deploys, assumed ordered NEWEST first.
 * Deploys without metrics contribute 0 impressions and are excluded from the
 * rate averages.
 */
export function buildSummary(
  deploys: Array<{ id: string; metrics: PostMetrics | null }>,
): DeploySummary {
  let totalImpressions = 0;
  const withMetrics: Array<{ id: string; rate: number }> = [];

  for (const deploy of deploys) {
    if (deploy.metrics === null) continue;
    totalImpressions += deploy.metrics.views;
    withMetrics.push({ id: deploy.id, rate: postEngagementRate(deploy.metrics) });
  }

  const avgEngagementRate = rollingAverageRate(withMetrics.map((d) => d.rate));

  let bestDeployId: string | null = null;
  let bestRate = -Infinity;
  for (const d of withMetrics) {
    if (d.rate > bestRate) {
      bestRate = d.rate;
      bestDeployId = d.id;
    }
  }

  return {
    totalImpressions,
    avgEngagementRate,
    bestDeployId,
    vsPreviousPeriodPct: periodOverPeriod(deploys),
  };
}

/**
 * Split deploys (NEWEST first) into a recent half and an older half by index
 * (ceil(n/2) recent) and return the percent change of recent avg rate over
 * older avg rate. Null when either half has no metrics or the older avg is 0.
 */
function periodOverPeriod(deploys: Array<{ id: string; metrics: PostMetrics | null }>): number | null {
  const recentCount = Math.ceil(deploys.length / 2);
  const recent = deploys.slice(0, recentCount);
  const older = deploys.slice(recentCount);

  const recentAvg = averageRateOf(recent);
  const olderAvg = averageRateOf(older);

  if (recentAvg === null || olderAvg === null || olderAvg === 0) return null;
  return ((recentAvg - olderAvg) / olderAvg) * 100;
}

/** Mean engagement rate over the deploys that have metrics, or null if none do. */
function averageRateOf(deploys: Array<{ metrics: PostMetrics | null }>): number | null {
  const rates = deploys
    .filter((d): d is { metrics: PostMetrics } => d.metrics !== null)
    .map((d) => postEngagementRate(d.metrics));
  return rollingAverageRate(rates);
}
