"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Rocket, Settings } from "lucide-react";
import type { DeployAnalytics, DeploySummary, PublicSettings } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { SettingsDialog } from "./SettingsDialog";
import { XLogo } from "./XLogo";
import { DeployDetailDrawer } from "./DeployDetailDrawer";
import { StatCard } from "./analytics/StatCard";
import { DeltaChip } from "./analytics/DeltaChip";
import { timeAgo } from "@/lib/format";

type Deploy = DeployAnalytics;

const pct = (n: number) => `${n.toFixed(1)}%`;

const EMPTY_SUMMARY: DeploySummary = {
  totalImpressions: 0,
  avgEngagementRate: null,
  bestDeployId: null,
  vsPreviousPeriodPct: null,
};

/** Per-post impressions oldest→newest, for the total-impressions spark. */
function impressionSpark(deploys: Deploy[]): number[] {
  return deploys
    .filter((d) => d.metrics)
    .map((d) => d.metrics!.views)
    .reverse();
}

/** Engagement rate of the top post, for the "Best post" stat. */
function bestLabel(deploys: Deploy[], bestId: string | null): string {
  const best = deploys.find((d) => d.id === bestId);
  const rate = best?.comparisons.engagementRate;
  return rate === null || rate === undefined ? "—" : pct(rate);
}

const Icon = {
  reply: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z" />
    </svg>
  ),
  repost: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
    </svg>
  ),
  like: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z" />
    </svg>
  ),
  views: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z" />
    </svg>
  ),
  bookmark: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
      <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z" />
    </svg>
  ),
};

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

function Stat({ icon, value }: { icon: React.ReactNode; value: number | null }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-faint">
      {icon}
      {value === null ? "—" : fmt(value)}
    </span>
  );
}

function DeployCard({ deploy, name, onOpen }: { deploy: Deploy; name: string | null; onOpen: () => void }) {
  const displayName = name ?? `@${deploy.handle}`;
  const c = deploy.comparisons;
  const headlineDelta = c.vsRollingAvgPct ?? c.vsPreviousPct;
  return (
    <article
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className="flex cursor-pointer flex-col rounded-xl border border-line bg-surface px-5 py-4 text-left transition-colors hover:border-line-strong focus:outline-none focus-visible:border-accent"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-base font-semibold text-accent">
          {displayName.replace("@", "").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-sm font-semibold">
            {displayName}
            <svg viewBox="0 0 22 22" width="15" height="15" fill="var(--color-accent)" aria-label="Verified">
              <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
            </svg>
          </p>
          <p className="truncate text-xs text-faint">
            @{deploy.handle} · {timeAgo(deploy.createdAt)}
          </p>
        </div>
        {deploy.url && (
          <a
            href={deploy.url}
            target="_blank"
            rel="noreferrer"
            aria-label="View on X"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto rounded-md p-1.5 text-muted transition-colors hover:bg-raised hover:text-fg"
          >
            <ExternalLink size={15} strokeWidth={2} />
          </a>
        )}
      </header>

      <p className="mt-3 flex-1 whitespace-pre-wrap text-[15px] leading-6">{deploy.text}</p>

      {(c.engagementRate !== null || c.predicted) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {c.engagementRate !== null && (
            <span className="rounded-full border border-line bg-raised/40 px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted">
              {pct(c.engagementRate)} engagement
            </span>
          )}
          {headlineDelta !== null && <DeltaChip value={headlineDelta} />}
          {c.predicted && (
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-accent">
              Predicted {pct(c.predicted.predictedRate)} · Actual {pct(c.predicted.actualRate)}
            </span>
          )}
        </div>
      )}

      <footer className="mt-4 flex items-center justify-between border-t border-line pt-3 pr-4">
        <Stat icon={Icon.reply} value={deploy.metrics?.replies ?? null} />
        <Stat icon={Icon.repost} value={deploy.metrics?.reposts ?? null} />
        <Stat icon={Icon.like} value={deploy.metrics?.likes ?? null} />
        <Stat icon={Icon.views} value={deploy.metrics?.views ?? null} />
        <Stat icon={Icon.bookmark} value={deploy.metrics?.bookmarks ?? null} />
      </footer>
    </article>
  );
}

export function DeploysHome() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [deploys, setDeploys] = useState<Deploy[] | null>(null);
  const [summary, setSummary] = useState<DeploySummary>(EMPTY_SUMMARY);
  const [live, setLive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setLoadError(false);
    try {
      const [dRes, sRes] = await Promise.all([fetch("/api/deploys"), fetch("/api/settings")]);
      if (!dRes.ok || !sRes.ok) throw new Error("load failed");
      const d = await dRes.json();
      setDeploys(d.deploys);
      setSummary(d.summary ?? EMPTY_SUMMARY);
      setLive(d.live);
      setSettings(await sRes.json());
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const openDeploy = deploys?.find((d) => d.id === openId) ?? null;

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar settings={settings} onOpenSettings={() => setShowSettings(true)} active="deploys" />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-6 py-3.5 max-md:px-4">
          <span className="logo-mask block h-5 w-6 text-fg md:hidden" aria-hidden="true" />
          <h1 className="text-[15px] font-semibold tracking-tight">Deploys</h1>
          {deploys !== null && deploys.length > 0 && (
            <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
              {deploys.length} shipped{live ? " · live engagement" : ""}
            </span>
          )}
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className="ml-auto rounded-lg border border-line p-2 text-muted transition-colors hover:border-line-strong hover:text-fg md:hidden"
          >
            <Settings size={16} strokeWidth={2} />
          </button>
        </header>

        {loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-24 text-center">
            <p className="text-sm font-medium">Couldn’t load your deploys.</p>
            <button onClick={load} className="mt-2 rounded-full bg-fg px-5 py-2 text-sm font-semibold text-ground">
              Try again
            </button>
          </div>
        ) : deploys === null ? (
          <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(340px,1fr))] content-start gap-6 overflow-y-auto p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-xl border border-line bg-surface" />
            ))}
          </div>
        ) : deploys.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-line-strong text-muted">
              <Rocket size={22} strokeWidth={1.75} />
            </span>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">Nothing shipped yet</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
              Posts published from Signal land here with their live engagement. Win a wind tunnel,
              then hit Ship on the verdict.
            </p>
            <a
              href="/dashboard"
              className="mt-6 rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-ground transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Open projects
            </a>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label="Total impressions"
                value={fmt(summary.totalImpressions)}
                spark={impressionSpark(deploys)}
              />
              <StatCard
                label="Avg engagement"
                value={summary.avgEngagementRate === null ? "—" : pct(summary.avgEngagementRate)}
                delta={summary.vsPreviousPeriodPct}
              />
              <StatCard label="Best post" value={bestLabel(deploys, summary.bestDeployId)} />
              <StatCard label="Shipped" value={String(deploys.length)} />
            </section>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] content-start gap-6">
              {deploys.map((d) => (
                <DeployCard
                  key={d.id}
                  deploy={d}
                  name={settings?.profile.name ?? null}
                  onOpen={() => setOpenId(d.id)}
                />
              ))}
            </div>
          </div>
        )}

        {deploys !== null && deploys.length > 0 && !live && (
          <p className="border-t border-line px-6 py-2.5 text-xs text-faint">
            <XLogo size={10} className="mr-1.5 inline-block text-muted" />
            Engagement numbers appear once the account is linked with Sign in with X.
          </p>
        )}
      </main>

      {openDeploy && (
        <DeployDetailDrawer
          deploy={openDeploy}
          name={settings?.profile.name ?? null}
          onClose={() => setOpenId(null)}
        />
      )}

      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => setSettings(s)}
        />
      )}
    </div>
  );
}
