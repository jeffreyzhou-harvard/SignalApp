"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Check, Heart, MessageCircle, Play, Repeat2, RotateCcw } from "lucide-react";
import type { AudienceCluster, AudienceSnapshot } from "@/lib/audience/types";
import type { CampaignVariant, SimEvent, SimResult, SimTally } from "@/lib/simulation/types";
import { applyEvent, emptyTally, engagementRate } from "@/lib/simulation/types";
import { XLogo } from "../XLogo";

/*
 * The campaign card: target a tribe → review Grok-drafted A/B creative →
 * run the wind tunnel (pluggable SimulationProvider) → verdict.
 * Data colors: variant A amber #ffb02e, variant B cyan #2fd6f6.
 */

export type PanelStage = "target" | "creative" | "sim" | "verdict";
type Stage = PanelStage;

const VARIANT_COLOR: Record<"A" | "B", string> = { A: "#ffb02e", B: "#2fd6f6" };

const ACTION_LABEL: Record<string, string> = {
  view: "viewed",
  like: "liked",
  repost: "reposted",
  reply: "replied",
  bookmark: "bookmarked",
};

const ACTION_ICON: Record<string, React.ReactNode> = {
  view: null,
  like: <Heart size={11} strokeWidth={2} />,
  repost: <Repeat2 size={11} strokeWidth={2} />,
  reply: <MessageCircle size={11} strokeWidth={2} />,
  bookmark: <Bookmark size={11} strokeWidth={2} />,
};

function Dots({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm text-muted" role="status" aria-label={label}>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="thinking-dot block h-1.5 w-1.5 rounded-full bg-muted"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

function VariantCard({
  variant,
  handle,
  winner,
  loser,
  compact = false,
}: {
  variant: CampaignVariant;
  handle: string | null;
  winner?: boolean;
  loser?: boolean;
  compact?: boolean;
}) {
  return (
    <article
      className={`overflow-hidden rounded-xl border bg-surface transition-opacity ${
        winner ? "border-line-strong" : "border-line"
      } ${loser ? "opacity-50" : ""}`}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-md text-xs font-bold text-ground"
          style={{ background: VARIANT_COLOR[variant.id] }}
        >
          {variant.id}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <XLogo size={10} className="text-fg" />
          {handle ? `@${handle}` : "draft"}
        </span>
        {winner && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-fg px-2 py-0.5 text-xs font-bold text-ground">
            <Check size={11} strokeWidth={3} /> Winner
          </span>
        )}
      </header>
      <p className={`whitespace-pre-wrap px-3 pb-2.5 text-[13px] leading-5 ${compact ? "line-clamp-3" : ""}`}>
        {variant.copy}
      </p>
      {variant.mediaUrl &&
        (variant.mediaKind === "video" ? (
          <video src={variant.mediaUrl} muted loop autoPlay playsInline className="max-h-44 w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={variant.mediaUrl} alt="" className="max-h-44 w-full object-cover" />
        ))}
    </article>
  );
}

function Meter({ label, a, b }: { label: string; a: number; b: number }) {
  const max = Math.max(a, b, 1);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="w-8 font-mono text-muted">{a}</span>
        <span className="uppercase tracking-wide text-faint">{label}</span>
        <span className="w-8 text-right font-mono text-muted">{b}</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded bg-raised">
        <div
          className="absolute right-1/2 top-0 h-full rounded-l"
          style={{ width: `${(a / max) * 50}%`, background: VARIANT_COLOR.A }}
        />
        <div
          className="absolute left-1/2 top-0 h-full rounded-r"
          style={{ width: `${(b / max) * 50}%`, background: VARIANT_COLOR.B }}
        />
      </div>
    </div>
  );
}

export function CampaignPanel({
  projectId,
  audience,
  xHandle,
  selectedId,
  onSelect,
  onStageChange,
  onSimRunning,
}: {
  projectId: string;
  audience: AudienceSnapshot;
  xHandle: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onStageChange?: (stage: PanelStage) => void;
  onSimRunning: (running: boolean) => void;
}) {
  const [stage, setStageState] = useState<Stage>("target");
  const setStage = useCallback(
    (s: Stage) => {
      setStageState(s);
      onStageChange?.(s);
    },
    [onStageChange]
  );
  const [variants, setVariants] = useState<CampaignVariant[] | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<SimResult | null>(null);
  const [tallyA, setTallyA] = useState<SimTally>(emptyTally());
  const [tallyB, setTallyB] = useState<SimTally>(emptyTally());
  const [feed, setFeed] = useState<SimEvent[]>([]);
  const [replies, setReplies] = useState<SimEvent[]>([]);
  const [progress, setProgress] = useState(0);
  const playback = useRef<ReturnType<typeof setInterval> | null>(null);

  const cluster: AudienceCluster | null = audience.clusters.find((c) => c.id === selectedId) ?? null;
  const memberById = useCallback(
    (id: number) => audience.members.find((m) => m.id === id),
    [audience.members]
  );

  useEffect(() => () => {
    if (playback.current) clearInterval(playback.current);
  }, []);

  async function draftVariants(clusterId: string) {
    setDrafting(true);
    setError(null);
    setStage("creative");
    try {
      const res = await fetch("/api/campaign/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, clusterId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not draft variants.");
      setVariants(json.variants);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft variants.");
    } finally {
      setDrafting(false);
    }
  }

  async function runSim() {
    if (!cluster || !variants) return;
    setError(null);
    setStage("sim");
    setTallyA(emptyTally());
    setTallyB(emptyTally());
    setFeed([]);
    setReplies([]);
    setProgress(0);
    onSimRunning(true);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, clusterId: cluster.id, variants }),
      });
      const json: SimResult | { error: string } = await res.json();
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Simulation failed.");
      }
      setResult(json);
      let i = 0;
      playback.current = setInterval(() => {
        if (i >= json.events.length) {
          if (playback.current) clearInterval(playback.current);
          onSimRunning(false);
          setTimeout(() => setStage("verdict"), 500);
          return;
        }
        const e = json.events[i++];
        if (e.variant === "A") setTallyA((t) => applyEvent(t, e));
        else setTallyB((t) => applyEvent(t, e));
        setFeed((f) => [e, ...f].slice(0, 5));
        if (e.reply) setReplies((r) => [e, ...r].slice(0, 3));
        setProgress(i / json.events.length);
      }, 75);
    } catch (err) {
      onSimRunning(false);
      setStage("creative");
      setError(err instanceof Error ? err.message : "Simulation failed.");
    }
  }

  const erA = result && stage === "verdict" ? result.engagement.A : engagementRate(tallyA);
  const erB = result && stage === "verdict" ? result.engagement.B : engagementRate(tallyB);
  const A = result && stage === "verdict" ? result.final.A : tallyA;
  const B = result && stage === "verdict" ? result.final.B : tallyB;

  return (
    <aside
      className="absolute bottom-0 right-0 top-0 flex w-[380px] flex-col overflow-y-auto border-l border-line bg-surface/85 backdrop-blur max-md:inset-x-0 max-md:top-auto max-md:max-h-[62%] max-md:w-full max-md:border-l-0 max-md:border-t"
      aria-label="Campaign"
    >
      {/* ── Target ─────────────────────────────────────────────── */}
      {stage === "target" && (
        <div className="flex flex-col gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">Who are we targeting?</h2>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              Pick the tribe this campaign is for. The creative gets tailored to how they read.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            {audience.clusters.map((c) => {
              const active = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(active ? null : c.id)}
                  aria-pressed={active}
                  className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    active ? "border-line-strong bg-raised" : "border-line hover:border-line-strong hover:bg-raised/50"
                  }`}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    {c.label}
                    <span className="ml-auto text-xs text-faint">{c.members.toLocaleString()}</span>
                  </span>
                  {active && <span className="mt-1 block text-xs leading-4 text-muted">{c.blurb}</span>}
                </button>
              );
            })}
          </div>
          <button
            disabled={!cluster}
            onClick={() => cluster && draftVariants(cluster.id)}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-fg px-4 py-2.5 text-sm font-semibold text-ground transition-opacity disabled:opacity-40"
          >
            Target this tribe
            <ArrowRight size={15} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* ── Creative ───────────────────────────────────────────── */}
      {stage === "creative" && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setStage("target");
                setError(null);
              }}
              aria-label="Back to targeting"
              className="rounded-md p-1 text-muted transition-colors hover:bg-raised hover:text-fg"
            >
              <ArrowLeft size={15} strokeWidth={2} />
            </button>
            <div>
              <h2 className="text-sm font-semibold">Creative for {cluster?.label ?? "this tribe"}</h2>
              <p className="text-xs text-faint">Two variants. The wind tunnel decides.</p>
            </div>
          </div>

          {drafting ? (
            <div className="flex h-40 items-center justify-center">
              <Dots label="Grok is drafting tribe-tailored copy" />
            </div>
          ) : variants ? (
            <>
              {variants.map((v) => (
                <VariantCard key={v.id} variant={v} handle={xHandle} />
              ))}
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => cluster && draftVariants(cluster.id)}
                  className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  <RotateCcw size={13} strokeWidth={2} />
                  Redraft
                </button>
                <button
                  onClick={runSim}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-ground transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Play size={14} strokeWidth={2.5} />
                  Run the wind tunnel
                </button>
              </div>
            </>
          ) : null}

          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] leading-5 text-danger">
              {error}
              <button
                onClick={() => cluster && draftVariants(cluster.id)}
                className="ml-2 font-semibold underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Wind tunnel ────────────────────────────────────────── */}
      {(stage === "sim" || stage === "verdict") && (
        <div className="flex flex-col gap-3 p-4">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Wind tunnel</h2>
              {stage === "sim" && (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
                  simulating
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-4 text-faint">
              {result
                ? `${result.agentCount.toLocaleString()} simulated agents · ${cluster?.label ?? ""} · ${
                    result.provider === "mock-agents" ? "seeded sample run" : result.provider
                  }`
                : `Spinning up agents from ${cluster?.label ?? "the tribe"}…`}
            </p>
          </div>

          {stage === "sim" && (
            <div className="h-1 overflow-hidden rounded bg-raised">
              <div className="h-full bg-fg transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
            </div>
          )}

          {variants && (
            <div className="grid grid-cols-2 gap-2">
              {variants.map((v) => {
                const er = v.id === "A" ? erA : erB;
                const isWinner = stage === "verdict" && result?.verdict.winner === v.id;
                const isLoser = stage === "verdict" && result?.verdict.winner !== v.id;
                return (
                  <div key={v.id} className="flex flex-col gap-1.5">
                    <VariantCard variant={v} handle={xHandle} winner={isWinner} loser={isLoser} compact />
                    <p className="text-center text-xs text-muted">
                      <span className="font-mono font-semibold text-fg">{er.toFixed(1)}%</span> engagement
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-ground/40 p-3">
            <Meter label="likes" a={A.likes} b={B.likes} />
            <Meter label="reposts" a={A.reposts} b={B.reposts} />
            <Meter label="replies" a={A.replies} b={B.replies} />
            <Meter label="bookmarks" a={A.bookmarks} b={B.bookmarks} />
          </div>

          {stage === "sim" && (
            <>
              <div className="flex min-h-[7.5rem] flex-col gap-1" aria-live="off">
                {feed.map((e, i) => {
                  const m = memberById(e.memberId);
                  if (!m) return null;
                  return (
                    <div
                      key={`${e.memberId}-${i}`}
                      className="flex items-center gap-2 text-xs"
                      style={{ opacity: 1 - i * 0.17 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.avatar} alt="" className="h-5 w-5 rounded-full border border-line object-cover" />
                      <span className="truncate text-muted">{m.handle}</span>
                      <span className="flex items-center gap-1 text-faint">
                        {ACTION_ICON[e.action]}
                        {ACTION_LABEL[e.action]}
                      </span>
                      <span
                        className="ml-auto rounded px-1 font-mono text-xs font-bold text-ground"
                        style={{ background: VARIANT_COLOR[e.variant] }}
                      >
                        {e.variant}
                      </span>
                    </div>
                  );
                })}
              </div>
              {replies.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {replies.map((e, i) => {
                    const m = memberById(e.memberId);
                    if (!m) return null;
                    return (
                      <div
                        key={`${e.memberId}-r-${i}`}
                        className="flex items-start gap-2 rounded-lg border border-line bg-raised/60 px-2.5 py-2 text-xs"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.avatar} alt="" className="h-5 w-5 rounded-full border border-line object-cover" />
                        <div className="min-w-0">
                          <span className="font-medium text-fg">{m.name}</span>
                          <p className="text-muted">{e.reply}</p>
                        </div>
                        <span
                          className="ml-auto rounded px-1 font-mono text-xs font-bold text-ground"
                          style={{ background: VARIANT_COLOR[e.variant] }}
                        >
                          {e.variant}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {stage === "verdict" && result && (
            <>
              <div className="rounded-xl border border-line-strong bg-raised px-4 py-3">
                <p className="text-sm font-semibold">
                  Variant {result.verdict.winner} wins
                </p>
                <p className="mt-0.5 text-[13px] leading-5 text-muted">
                  +{result.verdict.liftPct}% engagement lift · {result.verdict.confidencePct}% confidence · driven by{" "}
                  {result.verdict.driver}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setStage("target");
                    setResult(null);
                    setVariants(null);
                    onSelect(null);
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  <ArrowLeft size={13} strokeWidth={2} />
                  New target
                </button>
                <button
                  onClick={runSim}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-ground transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <RotateCcw size={13} strokeWidth={2.5} />
                  Run again
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
