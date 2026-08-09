"use client";

import { useEffect, useState } from "react";
import { ArrowUp, Check, ExternalLink, Film, Image as ImageIcon, ImagePlus, Send, Wand2 } from "lucide-react";

/*
 * The landing feature grid: four cards whose visuals are miniature, lightly
 * interactive replicas of the production surfaces (galaxy, composer + render,
 * wind tunnel, verdict/ship). All state is local and looping — no API calls.
 */

function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-ground">
      <div className="flex items-center gap-1.5 border-b border-line bg-raised/40 px-3 py-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        ))}
        <span className="ml-auto font-mono text-xs text-faint">{title}</span>
      </div>
      {children}
    </div>
  );
}

/* ── 1 · Mini galaxy ─────────────────────────────────────────── */

const NICHES = [
  { id: "builders", label: "AI Builders", count: "5,214", color: "#8b7cff" },
  { id: "students", label: "Students & EdTech", count: "4,388", color: "#2fd6f6" },
  { id: "founders", label: "Founders & VC", count: "1,942", color: "#3ee6a0" },
];

// [x%, y%, niche index, avatar file]
const NODES: Array<[number, number, number, string]> = [
  [14, 30, 0, "m3"], [24, 18, 0, "f7"], [30, 40, 0, "m12"], [18, 52, 0, "f21"], [36, 26, 0, "m31"],
  [56, 58, 1, "f12"], [66, 44, 1, "m22"], [74, 62, 1, "f33"], [62, 74, 1, "m41"], [82, 50, 1, "f45"], [70, 32, 1, "m8"],
  [40, 72, 2, "f2"], [30, 84, 2, "m17"], [50, 86, 2, "f28"],
];

function MiniGalaxy() {
  const [hover, setHover] = useState<number | null>(null);
  const [node, setNode] = useState<number | null>(null);
  return (
    <div
      className="relative h-56 select-none overflow-hidden"
      onMouseLeave={() => {
        setHover(null);
        setNode(null);
      }}
    >
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        {NODES.map(([x, y, t], i) =>
          NODES.slice(i + 1, i + 3).map(([x2, y2, t2]) =>
            t === t2 ? (
              <line
                key={`${i}-${x2}`}
                x1={`${x}%`} y1={`${y}%`} x2={`${x2}%`} y2={`${y2}%`}
                stroke={NICHES[t].color}
                strokeOpacity={hover === null || hover === t ? 0.3 : 0.05}
                strokeWidth="1"
              />
            ) : null
          )
        )}
      </svg>
      {NODES.map(([x, y, t, avatar], i) => (
        <button
          key={i}
          tabIndex={-1}
          onMouseEnter={() => {
            setHover(t);
            setNode(i);
          }}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            opacity: hover === null || hover === t ? 1 : 0.15,
            transform: `translate(-50%,-50%) scale(${node === i ? 1.35 : 1})`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/avatars/${avatar}.jpg`}
            alt=""
            className="h-7 w-7 rounded-full object-cover"
            style={{ boxShadow: `0 0 0 2px ${NICHES[t].color}, 0 0 10px ${NICHES[t].color}66` }}
          />
        </button>
      ))}
      <div className="absolute left-3 top-3 flex flex-col gap-1">
        {NICHES.map((tr, ti) => (
          <button
            key={tr.id}
            tabIndex={-1}
            onMouseEnter={() => setHover(ti)}
            className={`flex items-center gap-1.5 rounded-full border border-line bg-surface/80 px-2.5 py-1 text-xs backdrop-blur transition-opacity ${
              hover === null || hover === ti ? "text-muted" : "opacity-40"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tr.color }} />
            {tr.label}
            <span className="text-faint">{tr.count}</span>
          </button>
        ))}
      </div>
      {node !== null && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg border border-line-strong bg-overlay px-2.5 py-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/avatars/${NODES[node][3]}.jpg`} alt="" className="h-6 w-6 rounded-full object-cover" />
          <div className="text-left">
            <p className="text-xs font-medium text-fg">@{NODES[node][3]}_ships</p>
            <p className="text-xs text-faint">{NICHES[NODES[node][2]].label}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 2 · Mini composer + render ──────────────────────────────── */

function MiniStudio() {
  const [phase, setPhase] = useState<"rendering" | "done">("rendering");
  useEffect(() => {
    if (phase === "rendering") {
      const t = setTimeout(() => setPhase("done"), 1400);
      return () => clearTimeout(t);
    }
  }, [phase]);
  return (
    <div className="flex h-56 flex-col gap-2.5 p-3.5">
      <div className="flex min-h-0 flex-1 items-start gap-3">
        <div className="h-full w-28 shrink-0 overflow-hidden rounded-lg border border-line bg-raised">
          {phase === "done" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/landing/poster.jpg" alt="Generated launch poster" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full animate-pulse bg-raised" />
          )}
        </div>
        <div className="min-w-0 pt-1">
          <p className="font-mono text-xs text-faint">grok-imagine-image-quality</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            “launch poster for Byte, warm desk scene, EARLY BIRD $99 badge”
          </p>
          <button
            tabIndex={-1}
            onClick={() => setPhase("rendering")}
            className="mt-2 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            Re-render
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 rounded-xl border border-line-strong bg-raised px-2.5 py-2">
        <ImagePlus size={14} strokeWidth={2} className="text-muted" />
        <span className="rounded-md bg-fg p-1 text-ground">
          <Wand2 size={12} strokeWidth={2} />
        </span>
        <span className="flex items-center rounded-md border border-line p-0.5 text-xs font-medium">
          <span className="flex items-center gap-1 rounded bg-raised px-1.5 py-0.5 text-fg">
            <ImageIcon size={10} strokeWidth={2} /> Image
          </span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-muted">
            <Film size={10} strokeWidth={2} /> Video
          </span>
        </span>
        <span className="truncate text-xs text-faint">Describe your launch…</span>
        <span className="ml-auto rounded-full bg-fg p-1.5 text-ground">
          <ArrowUp size={11} strokeWidth={2.5} />
        </span>
      </div>
    </div>
  );
}

/* ── 3 · Mini wind tunnel ────────────────────────────────────── */

const FEED = [
  { avatar: "f12", handle: "@priya_cs26", action: "reposted", v: "B" },
  { avatar: "m22", handle: "@kai_notes", action: "liked", v: "B" },
  { avatar: "f33", handle: "@maya_builds", action: "bookmarked", v: "A" },
  { avatar: "m41", handle: "@sofia_dev", action: "replied", v: "B" },
  { avatar: "f45", handle: "@theo_gradszn", action: "liked", v: "A" },
] as const;

function MiniTunnel() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 900);
    return () => clearInterval(t);
  }, []);
  const phase = tick % 14;
  const progress = Math.min(1, phase / 10);
  const rows: Array<[string, number, number]> = [
    ["likes", 14, 29],
    ["replies", 6, 9],
    ["bookmarks", 5, 9],
  ];
  return (
    <div className="flex h-56 flex-col justify-center gap-2.5 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent" />
          simulating · 199 agents
        </span>
        <span className="font-mono text-xs text-faint">Students &amp; EdTech</span>
      </div>
      <div className="h-1 overflow-hidden rounded bg-raised">
        <div className="h-full bg-fg transition-[width] duration-700" style={{ width: `${progress * 100}%` }} />
      </div>
      {rows.map(([label, a, b]) => (
        <div key={label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="w-6 font-mono text-muted">{Math.round(a * progress)}</span>
            <span className="uppercase tracking-wide text-faint">{label}</span>
            <span className="w-6 text-right font-mono text-muted">{Math.round(b * progress)}</span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded bg-raised">
            <span
              className="absolute right-1/2 top-0 h-full rounded-l transition-all duration-700"
              style={{ width: `${(a / 29) * 50 * progress}%`, background: "#ffb02e" }}
            />
            <span
              className="absolute left-1/2 top-0 h-full rounded-r transition-all duration-700"
              style={{ width: `${(b / 29) * 50 * progress}%`, background: "#2fd6f6" }}
            />
          </div>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2 text-xs">
        {(() => {
          const e = FEED[tick % FEED.length];
          return (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/avatars/${e.avatar}.jpg`} alt="" className="h-5 w-5 rounded-full object-cover" />
              <span className="text-muted">{e.handle}</span>
              <span className="text-faint">{e.action}</span>
              <span
                className="ml-auto rounded px-1 font-mono text-xs font-bold text-ground"
                style={{ background: e.v === "A" ? "#ffb02e" : "#2fd6f6" }}
              >
                {e.v}
              </span>
            </>
          );
        })()}
      </div>
    </div>
  );
}

/* ── 4 · Mini verdict + ship ─────────────────────────────────── */

function MiniShip() {
  const [state, setState] = useState<"idle" | "posting" | "posted">("idle");
  useEffect(() => {
    if (state === "posting") {
      const t = setTimeout(() => setState("posted"), 900);
      return () => clearTimeout(t);
    }
    if (state === "posted") {
      const t = setTimeout(() => setState("idle"), 4200);
      return () => clearTimeout(t);
    }
  }, [state]);
  return (
    <div className="flex h-56 flex-col justify-center gap-3 p-4">
      <div className="rounded-xl border border-line-strong bg-raised px-3.5 py-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          Variant B wins
          <span className="rounded px-1 font-mono text-xs font-bold text-ground" style={{ background: "#2fd6f6" }}>
            B
          </span>
        </p>
        <p className="mt-0.5 text-xs leading-5 text-muted">
          +38% engagement lift · 96% confidence · driven by replies &amp; bookmarks
        </p>
      </div>
      {state === "posted" ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-raised px-3.5 py-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fg text-ground">
            <Check size={11} strokeWidth={3} />
          </span>
          <p className="text-sm font-medium">Posted from your account.</p>
          <span className="ml-auto flex items-center gap-1 text-xs font-medium text-accent">
            View
            <ExternalLink size={11} strokeWidth={2} />
          </span>
        </div>
      ) : (
        <button
          tabIndex={-1}
          onClick={() => setState("posting")}
          disabled={state === "posting"}
          className="flex items-center justify-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-semibold text-ground transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
        >
          <Send size={13} strokeWidth={2.5} />
          {state === "posting" ? "Posting…" : "Ship variant B to X"}
        </button>
      )}
      <p className="text-center font-mono text-xs text-faint">
        students-edtech-4388.csv → Ads custom audience
      </p>
    </div>
  );
}

/* ── Grid ────────────────────────────────────────────────────── */

const FEATURES = [
  {
    tag: "Audience map",
    windowTitle: "audience.map",
    title: "See who actually follows you.",
    body: "Signal clusters your real followers into interest niches, named, sized, and mapped, so you know exactly who you're talking to.",
    visual: <MiniGalaxy />,
  },
  {
    tag: "Grok Imagine",
    windowTitle: "creative.studio",
    title: "Creative drafted for every niche.",
    body: "Brief the copilot once. Grok drafts the post and renders the poster or teaser video, tuned to how each niche reads.",
    visual: <MiniStudio />,
  },
  {
    tag: "Wind tunnel",
    windowTitle: "windtunnel.run",
    title: "Pre-test before anything hits your feed.",
    body: "Simulated agents grounded in each niche react to your draft and its tailored version. See the winner before you post for real.",
    visual: <MiniTunnel />,
  },
  {
    tag: "Ship",
    windowTitle: "deploy.log",
    title: "Post the winner. Export the audience.",
    body: "Publish from your own account, then export any niche as an Ads-ready custom audience for paid reach.",
    visual: <MiniShip />,
  },
];

export function FeatureCards() {
  return (
    <div className="mt-10 grid gap-6 md:grid-cols-2">
      {FEATURES.map((f) => (
        <article
          key={f.tag}
          className="flex flex-col rounded-xl border border-line bg-surface p-6 transition-colors hover:border-line-strong"
        >
          <Window title={f.windowTitle}>{f.visual}</Window>
          <span className="mt-5 w-fit rounded border border-line px-1.5 py-px text-xs uppercase tracking-wide text-faint">
            {f.tag}
          </span>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">{f.title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-muted">{f.body}</p>
        </article>
      ))}
    </div>
  );
}
