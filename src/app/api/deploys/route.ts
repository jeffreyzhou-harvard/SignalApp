import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { getXAccessToken } from "@/lib/accounts/x-oauth";
import { fetchMetrics } from "@/lib/analytics/x-metrics";
import { buildComparisons, buildSummary, postEngagementRate } from "@/lib/analytics/compare";
import type { DeployAnalytics, MetricSnapshot, PostMetrics } from "@/lib/types";

export const runtime = "nodejs";

/** Newest 100 posts is the X API's per-request cap for the ids lookup. */
const MAX_LOOKUP = 100;
/** Min seconds between live metric refreshes, to respect X rate limits/cost. */
const TTL_SECONDS = Number(process.env.METRICS_TTL_SECONDS ?? 300);

/**
 * Posts published from Signal, enriched with live engagement from the X API,
 * a stored trend history, and comparisons against the account's own baselines.
 *
 * Metric fetches are TTL-gated: we only call X when a deploy's newest snapshot
 * is older than METRICS_TTL_SECONDS. Every fetch is persisted as a snapshot so
 * the UI can draw a trend line. Without an OAuth token, metrics come from the
 * last stored snapshot (or are null) and the UI shows placeholders.
 */
export async function GET() {
  const storage = getStorage();
  const deploys = await storage.listDeploys();
  if (deploys.length === 0) {
    return NextResponse.json({
      live: false,
      deploys: [],
      summary: { totalImpressions: 0, avgEngagementRate: null, bestDeployId: null, vsPreviousPeriodPct: null },
    });
  }

  // Existing history for every deploy (chronological, oldest first).
  const snapshotsById = new Map<string, MetricSnapshot[]>();
  await Promise.all(
    deploys.map(async (d) => snapshotsById.set(d.id, await storage.listMetricSnapshots(d.id)))
  );

  const nowMs = Date.now();
  const isStale = (id: string) => {
    const history = snapshotsById.get(id) ?? [];
    const last = history[history.length - 1];
    if (!last) return true;
    return nowMs - new Date(last.capturedAt).getTime() > TTL_SECONDS * 1000;
  };

  // Refresh live metrics for stale deploys (newest 100) when a token is available.
  try {
    const token = await getXAccessToken();
    const staleIds = deploys.slice(0, MAX_LOOKUP).filter((d) => isStale(d.id)).map((d) => d.id);
    if (token && staleIds.length > 0) {
      const fresh = await fetchMetrics(token, staleIds);
      const capturedAt = new Date().toISOString();
      await Promise.all(
        Object.entries(fresh).map(async ([deployId, metrics]) => {
          const snapshot: MetricSnapshot = { deployId, capturedAt, metrics };
          await storage.appendMetricSnapshot(snapshot);
          snapshotsById.get(deployId)?.push(snapshot);
        })
      );
    }
  } catch {
    // Fall back to whatever history we already have.
  }

  // Latest known metrics per deploy (from a fresh fetch or the last snapshot).
  const metricsById = new Map<string, PostMetrics | null>();
  for (const d of deploys) {
    const history = snapshotsById.get(d.id) ?? [];
    metricsById.set(d.id, history.length > 0 ? history[history.length - 1].metrics : null);
  }

  // Engagement rate for every deploy that has metrics — the baseline pool.
  const rateById = new Map<string, number>();
  for (const d of deploys) {
    const m = metricsById.get(d.id);
    if (m) rateById.set(d.id, postEngagementRate(m));
  }

  const enriched: DeployAnalytics[] = deploys.map((d, i) => {
    const metrics = metricsById.get(d.id) ?? null;
    // Rolling average excludes this deploy; previous = next-older deploy with metrics.
    const otherRates = deploys
      .filter((o) => o.id !== d.id && rateById.has(o.id))
      .map((o) => rateById.get(o.id)!);
    const prevRate = rateById.get(deploys[i + 1]?.id ?? "") ?? null;
    return {
      ...d,
      metrics,
      trend: snapshotsById.get(d.id) ?? [],
      comparisons: buildComparisons({ metrics, prediction: d.prediction, otherRates, prevRate }),
    };
  });

  const summary = buildSummary(deploys.map((d) => ({ id: d.id, metrics: metricsById.get(d.id) ?? null })));

  // "live" = we have real engagement to show (fresh or cached from a prior fetch).
  const live = enriched.some((d) => d.metrics !== null);

  return NextResponse.json({ live, deploys: enriched, summary });
}
