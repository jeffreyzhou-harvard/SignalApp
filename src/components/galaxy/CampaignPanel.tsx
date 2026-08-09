"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Bot, Check, ExternalLink, Film, Heart, Image as ImageIcon, ImagePlus, MessageCircle, Play, Repeat2, RotateCcw, Send, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { CreativeOptionsPanel } from "../creative/CreativeOptions";
import type { AudienceCluster, AudienceSnapshot } from "@/lib/audience/types";
import type { CampaignVariant, SimEvent, SimResult, SimTally } from "@/lib/simulation/types";
import { applyEvent, emptyTally, engagementRate } from "@/lib/simulation/types";
import { XLogo } from "../XLogo";
import { PostCard } from "./PostCard";

/*
 * The campaign card: target a niche → review Grok-drafted A/B creative →
 * run the wind tunnel (pluggable SimulationProvider) → verdict.
 * Data colors: variant A amber #ffb02e, variant B cyan #2fd6f6.
 */

export type PanelStage = "brief" | "draft" | "target" | "creative" | "sim" | "verdict";
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
          // Starts muted so autoplay is allowed; controls let the founder unmute.
          <video src={variant.mediaUrl} muted loop autoPlay playsInline controls className="max-h-56 w-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={variant.mediaUrl} alt="" className="max-h-56 w-full object-cover" />
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
  displayName = null,
  seedCopy = null,
  selectedId,
  onSelect,
  onStageChange,
  onSimRunning,
}: {
  projectId: string;
  audience: AudienceSnapshot;
  xHandle: string | null;
  displayName?: string | null;
  /** Copy iterated in chat; overrides the drafted baseline for the next test. */
  seedCopy?: string | null;
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
  const [briefChecked, setBriefChecked] = useState(false);
  const [briefText, setBriefText] = useState("");
  const [briefImages, setBriefImages] = useState<{ url: string; name: string }[]>([]);
  const [briefUploading, setBriefUploading] = useState(false);
  const [briefRendering, setBriefRendering] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefKind, setBriefKind] = useState<"image" | "video">("image");
  const [briefStyle, setBriefStyle] = useState("none");
  const [briefRatio, setBriefRatio] = useState("auto");
  const [briefRes, setBriefRes] = useState<"1k" | "2k">("1k");
  const [briefOptsOpen, setBriefOptsOpen] = useState(false);
  const [briefDragging, setBriefDragging] = useState(false);
  const briefDragDepth = useRef(0);
  const briefFileRef = useRef<HTMLInputElement>(null);
  const [baseline, setBaseline] = useState<CampaignVariant | null>(null);
  const [tailored, setTailored] = useState<CampaignVariant | null>(null);
  const [loadingBaseline, setLoadingBaseline] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const variants: CampaignVariant[] | null = baseline && tailored ? [baseline, tailored] : null;

  const [result, setResult] = useState<SimResult | null>(null);
  const [draftShipping, setDraftShipping] = useState(false);
  const [draftShipped, setDraftShipped] = useState<{ url: string | null } | null>(null);
  const [draftShipError, setDraftShipError] = useState<string | null>(null);
  const [shipping, setShipping] = useState(false);
  const [shipped, setShipped] = useState<{ url: string | null } | null>(null);
  const [shipError, setShipError] = useState<string | null>(null);
  const [improving, setImproving] = useState(false);
  const [improveStep, setImproveStep] = useState(0);
  const [agentRationale, setAgentRationale] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [scope, setScope] = useState<"niche" | "all">("niche");
  const [tallyA, setTallyA] = useState<SimTally>(emptyTally());
  const [tallyB, setTallyB] = useState<SimTally>(emptyTally());
  const [feed, setFeed] = useState<SimEvent[]>([]);
  const [replies, setReplies] = useState<SimEvent[]>([]);
  const [progress, setProgress] = useState(0);
  const playback = useRef<ReturnType<typeof setInterval> | null>(null);

  // Multi-target: the niches the creative is tailored to. The map focus
  // (selectedId) stays single — focusing a niche adds it to the targets.
  const [targetIds, setTargetIds] = useState<string[]>([]);
  useEffect(() => {
    if (selectedId) setTargetIds((prev) => (prev.includes(selectedId) ? prev : [...prev, selectedId]));
  }, [selectedId]);
  const targets = audience.clusters.filter((c) => targetIds.includes(c.id));
  const allTargeted = targets.length === audience.clusters.length && targets.length > 0;
  const cluster: AudienceCluster | null = targets[0] ?? null;
  const targetLabel = allTargeted
    ? "all niches"
    : targets.length > 1
      ? `${targets.length} niches`
      : (cluster?.label ?? "this niche");
  const memberById = useCallback(
    (id: number) => audience.members.find((m) => m.id === id),
    [audience.members]
  );

  useEffect(() => () => {
    if (playback.current) clearInterval(playback.current);
  }, []);

  // A project with no messages yet starts at the brief: upload material,
  // describe the look, render the first creative.
  useEffect(() => {
    let dead = false;
    fetch(`/api/projects/${projectId}/messages`)
      .then((r) => r.json())
      .then((m) => {
        if (dead || !Array.isArray(m)) return;
        if (m.length === 0) setStage("brief");
        else {
          setStage("draft");
          loadBaseline();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!dead) setBriefChecked(true);
      });
    return () => {
      dead = true;
    };
  }, [projectId, setStage]);

  // Dragging files anywhere onto the page during the brief step attaches them
  // as product shots, mirroring the chat composer's drop behavior.
  useEffect(() => {
    if (stage !== "brief") return;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      briefDragDepth.current++;
      setBriefDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = () => {
      briefDragDepth.current = Math.max(0, briefDragDepth.current - 1);
      if (briefDragDepth.current === 0) setBriefDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      briefDragDepth.current = 0;
      setBriefDragging(false);
      attachBriefFiles(e.dataTransfer?.files ?? null);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      briefDragDepth.current = 0;
      setBriefDragging(false);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  async function attachBriefFiles(files: FileList | null) {
    if (!files?.length) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setBriefUploading(true);
    setBriefError(null);
    try {
      for (const file of images) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed.");
        setBriefImages((prev) => [...prev, { url: json.url, name: file.name }]);
      }
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBriefUploading(false);
      if (briefFileRef.current) briefFileRef.current.value = "";
    }
  }

  async function generateFromBrief() {
    const text = briefText.trim();
    if (!text || briefRendering) return;
    setBriefRendering(true);
    setBriefError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          text,
          images: briefImages.map((i) => i.url),
          mode: "imagine",
          mediaType: briefKind,
          aspectRatio: briefRatio,
          resolution: briefRes,
          style: briefStyle,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Rendering failed.");
      setStage("draft");
      loadBaseline();
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : "Rendering failed.");
    } finally {
      setBriefRendering(false);
    }
  }

  // Cycle the agent's progress caption while it works.
  useEffect(() => {
    if (!improving) return;
    setImproveStep(0);
    const t = setInterval(() => setImproveStep((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, [improving]);

  async function loadBaseline() {
    setLoadingBaseline(true);
    setError(null);
    try {
      const res = await fetch("/api/campaign/baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load your draft post.");
      // Copy iterated in chat wins over the auto-drafted baseline.
      setBaseline(seedCopy ? { ...json.variant, copy: seedCopy.slice(0, 280) } : json.variant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your draft post.");
    } finally {
      setLoadingBaseline(false);
    }
  }

  async function shipDraft() {
    if (!baseline) return;
    setDraftShipping(true);
    setDraftShipError(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: baseline.copy, projectId }),
      });
      const json = await res.json();
      if (!res.ok || !json.posted) throw new Error(json.error ?? "Publishing failed.");
      setDraftShipped({ url: json.url ?? null });
    } catch (err) {
      setDraftShipError(err instanceof Error ? err.message : "Publishing failed.");
    } finally {
      setDraftShipping(false);
    }
  }

  /** Picking niches goes straight to tailoring: copy AND poster, both nudged. */
  function startTailor() {
    setTailored(null);
    setAgentRationale(null);
    setRound(1);
    setStage("creative");
    tailor();
  }

  async function tailor() {
    if (!baseline || targets.length === 0) return;
    setTailoring(true);
    setError(null);
    try {
      const res = await fetch("/api/campaign/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          clusterId: targets[0].id,
          clusterIds: targets.map((c) => c.id),
          baselineCopy: baseline.copy,
          mediaUrl: baseline.mediaUrl,
          mediaKind: baseline.mediaKind,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not tailor the post.");
      setTailored(json.variant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not tailor the post.");
    } finally {
      setTailoring(false);
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
        body: JSON.stringify({ projectId, clusterId: cluster.id, variants, scope }),
      });
      const json: SimResult | { error: string } = await res.json();
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Simulation failed.");
      }
      setResult(json);
      const tick = Math.max(75, Math.min(600, Math.floor(9000 / Math.max(1, json.events.length))));
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
      }, tick);
    } catch (err) {
      onSimRunning(false);
      setStage("creative");
      setError(err instanceof Error ? err.message : "Simulation failed.");
    }
  }

  async function shipWinner() {
    if (!result || !variants) return;
    const winner = variants.find((v) => v.id === result.verdict.winner) ?? variants[1];
    setShipping(true);
    setShipError(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: winner.copy,
          projectId,
          // Capture the wind-tunnel prediction so Deploys can show predicted vs actual.
          prediction: {
            winner: result.verdict.winner,
            predictedLiftPct: result.verdict.liftPct,
            confidencePct: result.verdict.confidencePct,
            driver: result.verdict.driver,
            predictedEngagementRate: result.engagement[result.verdict.winner],
            provider: result.provider,
            agentCount: result.agentCount,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.posted) throw new Error(json.error ?? "Publishing failed.");
      setShipped({ url: json.url ?? null });
    } catch (err) {
      setShipError(err instanceof Error ? err.message : "Publishing failed.");
    } finally {
      setShipping(false);
    }
  }

  const IMPROVE_STEPS = [
    "Reading the wind-tunnel results…",
    "Rewriting the copy around what won…",
    "Re-rendering the creative with Grok Imagine…",
    "Assembling the next challenger…",
  ];

  async function improveWithAgent() {
    if (!result || !variants || !cluster) return;
    const winner = variants.find((v) => v.id === result.verdict.winner) ?? variants[1];
    const loser = variants.find((v) => v.id !== result.verdict.winner) ?? variants[0];
    setImproving(true);
    setError(null);
    try {
      const replies = result.events
        .filter((e) => e.reply)
        .slice(-8)
        .map((e) => ({ text: e.reply!, sentiment: e.sentiment, variant: e.variant }));
      const res = await fetch("/api/campaign/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          clusterId: cluster.id,
          clusterIds: targets.map((c) => c.id),
          winner,
          loser,
          verdict: result.verdict,
          engagement: result.engagement,
          replies,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The agent run failed.");
      // Loop: last round's winner becomes A, the agent's challenger becomes B.
      setBaseline({ ...winner, id: "A" });
      setTailored(json.variant);
      setAgentRationale(json.rationale ?? null);
      setRound((r) => r + 1);
      setResult(null);
      setShipped(null);
      setShipError(null);
      setStage("creative");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The agent run failed.");
    } finally {
      setImproving(false);
    }
  }

  const erA = result && stage === "verdict" ? result.engagement.A : engagementRate(tallyA);
  const erB = result && stage === "verdict" ? result.engagement.B : engagementRate(tallyB);
  const A = result && stage === "verdict" ? result.final.A : tallyA;
  const B = result && stage === "verdict" ? result.final.B : tallyB;

  return (
    <aside
      className="absolute bottom-0 right-0 top-0 flex w-140 flex-col overflow-y-auto border-l border-line bg-surface/85 backdrop-blur max-md:inset-x-0 max-md:top-auto max-md:max-h-[62%] max-md:w-full max-md:border-l-0 max-md:border-t"
      aria-label="Campaign"
    >
      {/* ── Brief ──────────────────────────────────────────────── */}
      {stage === "brief" && briefDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ground/80 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line-strong px-16 py-12">
            <ImagePlus size={28} strokeWidth={1.75} className="text-muted" />
            <p className="text-sm font-semibold">Drop product shots to attach</p>
            <p className="text-[13px] text-muted">They’ll ground the launch creative.</p>
          </div>
        </div>
      )}
      {stage === "brief" && (
        <div className="flex flex-col gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">Brief the launch</h2>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              Upload your product shots and describe how the marketing material should look.
              Grok Imagine renders the launch creative that goes into the wind tunnel.
            </p>
          </div>

          {briefImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {briefImages.map((img) => (
                <span key={img.url} className="group relative block h-16 w-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.name}
                    className="h-16 w-16 rounded-lg border border-line object-cover"
                  />
                  <button
                    onClick={() => setBriefImages((prev) => prev.filter((x) => x.url !== img.url))}
                    aria-label={`Remove ${img.name}`}
                    className="absolute -right-1.5 -top-1.5 rounded-full border border-line-strong bg-overlay p-0.5 text-muted hover:text-fg"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            ref={briefFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => attachBriefFiles(e.target.files)}
          />
          <button
            onClick={() => briefFileRef.current?.click()}
            disabled={briefUploading || briefRendering}
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-3 text-[13px] font-medium text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50"
          >
            <ImagePlus size={15} strokeWidth={2} />
            {briefUploading ? "Uploading…" : "Add product shots, or drag them anywhere"}
          </button>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-raised/50 px-3.5 py-2">
            <span className="text-xs text-muted">Creative</span>
            <div className="relative ml-auto">
              <button
                onClick={() => setBriefOptsOpen((v) => !v)}
                aria-expanded={briefOptsOpen}
                aria-label="Customize style and size"
                className={`flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs font-medium transition-colors ${
                  briefOptsOpen || briefStyle !== "none" || briefRatio !== "auto" || briefRes !== "1k"
                    ? "bg-raised text-fg"
                    : "text-muted hover:border-line-strong hover:text-fg"
                }`}
              >
                <SlidersHorizontal size={12} strokeWidth={2} />
                Customize
              </button>
              {briefOptsOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBriefOptsOpen(false)} aria-hidden="true" />
                  <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-line-strong bg-overlay p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]">
                    <CreativeOptionsPanel
                      mediaKind={briefKind}
                      style={briefStyle}
                      onStyle={setBriefStyle}
                      aspectRatio={briefRatio}
                      onAspectRatio={(v) => {
                        setBriefRatio(v);
                        setBriefOptsOpen(false);
                      }}
                      resolution={briefRes}
                      onResolution={setBriefRes}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center rounded-lg border border-line p-0.5" role="tablist" aria-label="Creative type">
              <button
                role="tab"
                aria-selected={briefKind === "image"}
                onClick={() => setBriefKind("image")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  briefKind === "image" ? "bg-raised text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <ImageIcon size={12} strokeWidth={2} />
                Image
              </button>
              <button
                role="tab"
                aria-selected={briefKind === "video"}
                onClick={() => setBriefKind("video")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  briefKind === "video" ? "bg-raised text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <Film size={12} strokeWidth={2} />
                Video
              </button>
            </div>
          </div>

          <textarea
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            rows={4}
            placeholder="What are you launching, and how should the material look? e.g. bold dark poster, product front and center, electric momentum"
            aria-label="Launch brief"
            className="w-full resize-none rounded-xl border border-line bg-raised px-3.5 py-2.5 text-[13px] leading-5 placeholder:text-faint focus:border-accent focus:outline-none"
          />

          {briefImages.length > 0 && (
            <p className="text-center text-xs leading-4 text-faint">
              {briefKind === "video"
                ? "Your upload becomes the opening frame; the brief directs the motion."
                : "Your upload grounds the render; the brief describes the look."}
            </p>
          )}

          {briefRendering ? (
            <div className="flex h-16 items-center justify-center">
              <Dots
                label={
                  briefKind === "video"
                    ? "Rendering your teaser video with Grok Imagine (a minute or two)"
                    : "Rendering your creative with Grok Imagine"
                }
              />
            </div>
          ) : (
            <button
              onClick={generateFromBrief}
              disabled={!briefText.trim() || briefUploading}
              className="flex items-center justify-center gap-1.5 rounded-full bg-fg px-4 py-2.5 text-sm font-semibold text-ground transition-transform enabled:hover:scale-[1.02] enabled:active:scale-[0.98] disabled:opacity-40"
            >
              <Sparkles size={14} strokeWidth={2} />
              Generate creative
            </button>
          )}

          <button
            onClick={() => {
              setStage("draft");
              loadBaseline();
            }}
            disabled={briefRendering}
            className="text-center text-xs font-medium text-faint transition-colors hover:text-fg disabled:opacity-50"
          >
            Skip uploads, draft the post now
          </button>

          {briefError && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] leading-5 text-danger">
              {briefError}
            </div>
          )}
        </div>
      )}

      {/* ── First pass ─────────────────────────────────────────── */}
      {stage === "draft" && (
        <div className="flex flex-col gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold">Your launch post</h2>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              The first pass, straight from your brief. Ship it as is, or tailor it to a niche
              and A/B test the two versions.
            </p>
          </div>

          {loadingBaseline ? (
            <div className="flex h-40 items-center justify-center">
              <Dots label="Drafting your launch post" />
            </div>
          ) : baseline ? (
            <>
              <PostCard variant={baseline} handle={xHandle} name={displayName} label="First pass" />

              {draftShipped ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-raised px-4 py-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fg text-ground">
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <p className="text-sm font-medium">Posted to X from your account.</p>
                  {draftShipped.url && (
                    <a
                      href={draftShipped.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
                    >
                      View
                      <ExternalLink size={12} strokeWidth={2} />
                    </a>
                  )}
                </div>
              ) : (
                <button
                  onClick={shipDraft}
                  disabled={draftShipping}
                  className="flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-semibold text-ground transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  <Send size={14} strokeWidth={2.5} />
                  {draftShipping ? "Posting…" : "Post this to X"}
                </button>
              )}
              {draftShipError && (
                <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] leading-5 text-danger">
                  {draftShipError}
                </p>
              )}

              <button
                onClick={() => setStage("target")}
                className="flex items-center justify-center gap-1.5 rounded-full border border-line-strong bg-raised px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-overlay"
              >
                Tailor for a niche
                <ArrowRight size={15} strokeWidth={2.5} />
              </button>
              <p className="text-center text-xs leading-5 text-faint">
                Grok reworks the copy and nudges the poster for that audience; the wind tunnel
                then A/B tests both versions.
              </p>
            </>
          ) : null}

          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] leading-5 text-danger">
              {error}
              <button onClick={loadBaseline} className="ml-2 font-semibold underline underline-offset-2">
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Target ─────────────────────────────────────────────── */}
      {briefChecked && stage === "target" && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStage("draft")}
              aria-label="Back to your post"
              className="rounded-md p-1 text-muted transition-colors hover:bg-raised hover:text-fg"
            >
              <ArrowLeft size={15} strokeWidth={2} />
            </button>
            <h2 className="text-sm font-semibold">Who are we targeting?</h2>
          </div>
          <p className="text-[13px] leading-5 text-muted">
            Pick one or more niches. Grok tailors the copy and creative to how they read.
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => {
                setTargetIds(allTargeted ? [] : audience.clusters.map((c) => c.id));
                if (allTargeted) onSelect(null);
              }}
              aria-pressed={allTargeted}
              className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                allTargeted ? "border-line-strong bg-raised" : "border-line hover:border-line-strong hover:bg-raised/50"
              }`}
            >
              <span className="flex items-center gap-2 text-[13px] font-medium">
                <Sparkles size={13} strokeWidth={2} className="text-muted" />
                All niches
                <span className="ml-auto text-xs text-faint">{audience.totalFollowers.toLocaleString()}</span>
              </span>
            </button>
            {audience.clusters.map((c) => {
              const active = targetIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setTargetIds((prev) => (active ? prev.filter((x) => x !== c.id) : [...prev, c.id]));
                    onSelect(active ? null : c.id);
                  }}
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
                  {active && c.summary && (
                    <span className="mt-1.5 block text-xs leading-[1.15rem] text-faint">{c.summary}</span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            disabled={!cluster}
            onClick={() => cluster && startTailor()}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-fg px-4 py-2.5 text-sm font-semibold text-ground transition-opacity disabled:opacity-40"
          >
            {allTargeted ? "Tailor for all niches" : targets.length > 1 ? `Tailor for ${targets.length} niches` : "Tailor for this niche"}
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
              <h2 className="text-sm font-semibold">Post for {targetLabel}</h2>
              <p className="text-xs text-faint">
                {tailored ? "Two versions. The wind tunnel decides." : "Your draft as it stands today."}
              </p>
            </div>
          </div>

          {loadingBaseline ? (
            <div className="flex h-40 items-center justify-center">
              <Dots label="Assembling your current draft" />
            </div>
          ) : baseline ? (
            <>
              {agentRationale && round > 1 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-line bg-raised/60 px-3.5 py-2.5">
                  <Bot size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-muted" />
                  <p className="text-xs leading-5 text-muted">{agentRationale}</p>
                </div>
              )}
              <PostCard
                variant={baseline}
                handle={xHandle}
                name={displayName}
                label={round > 1 ? `Reigning winner · round ${round - 1}` : "First pass"}
              />

              {tailoring ? (
                <div className="flex h-24 items-center justify-center">
                  <Dots label={`Grok is reworking the copy and creative for ${targetLabel}`} />
                </div>
              ) : tailored ? (
                <>
                  <PostCard
                    variant={tailored}
                    handle={xHandle}
                    name={displayName}
                    label={
                      round > 1 ? "Agent-improved challenger" : `Tailored for ${targetLabel}`
                    }
                  />
                  <div className="flex items-center justify-between rounded-xl border border-line bg-raised/50 px-3.5 py-2">
                    <span className="text-xs text-muted">Test on</span>
                    <div className="flex items-center rounded-lg border border-line p-0.5" role="tablist" aria-label="Wind tunnel scope">
                      <button
                        role="tab"
                        aria-selected={scope === "niche"}
                        onClick={() => setScope("niche")}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          scope === "niche" ? "bg-raised text-fg" : "text-muted hover:text-fg"
                        }`}
                      >
                        This niche
                      </button>
                      <button
                        role="tab"
                        aria-selected={scope === "all"}
                        onClick={() => setScope("all")}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          scope === "all" ? "bg-raised text-fg" : "text-muted hover:text-fg"
                        }`}
                      >
                        Whole audience
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 flex gap-2">
                    <button
                      onClick={() => cluster && tailor()}
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
                      Approve A/B test
                    </button>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] leading-5 text-danger">
              {error}
              <button
                onClick={() => (baseline ? cluster && tailor() : loadBaseline())}
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
                : `Spinning up agents from ${cluster?.label ?? "the niche"}…`}
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
                    <VariantCard variant={v} handle={xHandle} winner={isWinner} loser={isLoser} />
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
                {result.engagement.A === 0 && result.engagement.B === 0 ? (
                  <>
                    <p className="text-sm font-semibold">No clear winner</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-muted">
                      The simulated audience scrolled past both versions. This niche may not care
                      about this post; try the agent, a different niche, or a sharper hook.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold">
                      Variant {result.verdict.winner} wins
                    </p>
                    <p className="mt-0.5 text-[13px] leading-5 text-muted">
                      +{result.verdict.liftPct}% engagement lift · {result.verdict.confidencePct}% confidence · driven by{" "}
                      {result.verdict.driver}
                    </p>
                  </>
                )}
              </div>

              {improving ? (
                <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-line bg-raised/60 px-4 py-6">
                  <Dots label={IMPROVE_STEPS[Math.min(improveStep, IMPROVE_STEPS.length - 1)]} />
                  <p className="text-center text-xs leading-5 text-faint">
                    The agent iterates on the winner from the test results, then you approve another round.
                  </p>
                </div>
              ) : (
                <>
              {!shipped && (
                <button
                  onClick={improveWithAgent}
                  className="flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-semibold text-ground transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Bot size={15} strokeWidth={2} />
                  Improve with the agent
                </button>
              )}
              {shipped ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-raised px-4 py-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fg text-ground">
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <p className="text-sm font-medium">Posted to X from your account.</p>
                  {shipped.url && (
                    <a
                      href={shipped.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
                    >
                      View
                      <ExternalLink size={12} strokeWidth={2} />
                    </a>
                  )}
                </div>
              ) : (
                <button
                  onClick={shipWinner}
                  disabled={shipping}
                  className="flex items-center justify-center gap-2 rounded-full border border-line-strong bg-raised px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-overlay disabled:opacity-50"
                >
                  <Send size={14} strokeWidth={2.5} />
                  {shipping ? "Posting…" : `Ship variant ${result.verdict.winner} to X`}
                </button>
              )}
              {shipError && (
                <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] leading-5 text-danger">
                  {shipError}
                </p>
              )}
              {error && (
                <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] leading-5 text-danger">
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setStage("target");
                    setResult(null);
                    setBaseline(null);
                    setTailored(null);
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
            </>
          )}
        </div>
      )}
    </aside>
  );
}
