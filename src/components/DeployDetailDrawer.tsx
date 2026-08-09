"use client";

import { useEffect } from "react";
import { ExternalLink, X as Close } from "lucide-react";
import type { DeployAnalytics } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { Sparkline } from "./analytics/Sparkline";
import { DeltaChip } from "./analytics/DeltaChip";

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

const pct = (n: number) => `${n.toFixed(1)}%`;

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-fg">{value}</span>
    </div>
  );
}

/**
 * Slide-in panel with a deploy's full engagement breakdown, its impression
 * trend, and — when the post shipped from a wind tunnel — the prediction the
 * simulation made versus what actually happened.
 */
export function DeployDetailDrawer({
  deploy,
  name,
  onClose,
}: {
  deploy: DeployAnalytics;
  name: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const m = deploy.metrics;
  const c = deploy.comparisons;
  const displayName = name ?? `@${deploy.handle}`;
  const impressionTrend = deploy.trend.map((s) => s.metrics.views);
  const owned = (v: number | undefined) => (v === undefined ? "—" : fmt(v));

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-overlay/70 backdrop-blur-sm" onClick={onClose} />

      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-base font-semibold text-accent">
            {displayName.replace("@", "").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="truncate text-xs text-faint">
              @{deploy.handle} · {timeAgo(deploy.createdAt)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {deploy.url && (
              <a
                href={deploy.url}
                target="_blank"
                rel="noreferrer"
                aria-label="View on X"
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-raised hover:text-fg"
              >
                <ExternalLink size={16} strokeWidth={2} />
              </a>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-raised hover:text-fg"
            >
              <Close size={18} strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-6 px-5 py-5">
          <p className="whitespace-pre-wrap text-[15px] leading-6">{deploy.text}</p>

          {/* Headline engagement rate + baselines */}
          <section className="rounded-xl border border-line bg-raised/40 px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-faint">Engagement rate</p>
            <div className="mt-1 flex items-end gap-3">
              <span className="text-3xl font-semibold tabular-nums text-fg">
                {c.engagementRate === null ? "—" : pct(c.engagementRate)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {c.vsRollingAvgPct !== null && (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <DeltaChip value={c.vsRollingAvgPct} /> vs your average
                </span>
              )}
              {c.vsPreviousPct !== null && (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <DeltaChip value={c.vsPreviousPct} /> vs last post
                </span>
              )}
              {c.vsRollingAvgPct === null && c.vsPreviousPct === null && (
                <span className="text-xs text-faint">Not enough history to compare yet.</span>
              )}
            </div>
          </section>

          {/* Predicted vs actual — only for wind-tunnel deploys */}
          {c.predicted && deploy.prediction && (
            <section className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Wind tunnel · predicted vs actual
                </p>
                <DeltaChip value={c.predicted.deltaPct} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-faint">Predicted</p>
                  <p className="text-xl font-semibold tabular-nums text-fg">{pct(c.predicted.predictedRate)}</p>
                </div>
                <div>
                  <p className="text-xs text-faint">Actual</p>
                  <p className="text-xl font-semibold tabular-nums text-fg">{pct(c.predicted.actualRate)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted">
                Predicted variant {deploy.prediction.winner} at {deploy.prediction.confidencePct}% confidence —
                driven by {deploy.prediction.driver}. {deploy.prediction.agentCount.toLocaleString()} simulated agents.
              </p>
            </section>
          )}

          {/* Impression trend */}
          {impressionTrend.length >= 2 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-faint">Impressions over time</p>
                <span className="text-xs tabular-nums text-muted">{fmt(impressionTrend[impressionTrend.length - 1])}</span>
              </div>
              <Sparkline data={impressionTrend} width={360} height={64} className="w-full" />
            </section>
          )}

          {/* Full breakdown */}
          <section className="rounded-xl border border-line bg-surface px-4 py-1">
            <MetricRow label="Impressions" value={m ? fmt(m.views) : "—"} />
            <MetricRow label="Likes" value={m ? fmt(m.likes) : "—"} />
            <MetricRow label="Reposts + quotes" value={m ? fmt(m.reposts) : "—"} />
            <MetricRow label="Replies" value={m ? fmt(m.replies) : "—"} />
            <MetricRow label="Bookmarks" value={m ? fmt(m.bookmarks) : "—"} />
            <MetricRow label="Link clicks" value={owned(m?.linkClicks)} />
            <MetricRow label="Profile clicks" value={owned(m?.profileClicks)} />
            <MetricRow label="Total engagements" value={owned(m?.engagements)} />
          </section>

          {(m?.linkClicks === undefined) && (
            <p className="text-xs leading-5 text-faint">
              Link and profile clicks are owner-only metrics from X and appear for posts published in the
              last 30 days once the account is linked with Sign in with X.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
