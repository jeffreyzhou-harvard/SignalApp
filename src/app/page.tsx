import { ArrowRight } from "lucide-react";

const AUTH_START = "/api/auth/x/start?returnTo=/dashboard";

const X_MASK = {
  mask: "url(/X_icon.png) no-repeat center / contain",
  WebkitMask: "url(/X_icon.png) no-repeat center / contain",
};

/** Framed mini-window, the visual chrome of the feature cards. */
function Window({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-raised">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        ))}
        {title && <span className="ml-auto font-mono text-xs text-faint">{title}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const TRIBE_COLORS = ["#8b7cff", "#2fd6f6", "#ffb02e", "#ff7ac6", "#3ee6a0", "#6aa6ff"];

function MapVisual() {
  const dots = [
    [22, 30, 0], [34, 22, 0], [28, 44, 0], [14, 38, 0],
    [58, 18, 1], [70, 28, 1], [64, 40, 1],
    [44, 62, 2], [56, 70, 2], [36, 74, 2],
    [80, 58, 3], [88, 70, 3], [74, 72, 3],
  ];
  return (
    <svg viewBox="0 0 100 88" className="h-36 w-full" aria-hidden="true">
      {dots.map(([x, y, c], i) =>
        dots.slice(i + 1, i + 3).map(([x2, y2, c2]) =>
          c === c2 ? (
            <line key={`${i}-${x2}`} x1={x} y1={y} x2={x2} y2={y2} stroke={TRIBE_COLORS[c]} strokeOpacity="0.35" strokeWidth="0.6" />
          ) : null
        )
      )}
      {dots.map(([x, y, c], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill={TRIBE_COLORS[c]} />
      ))}
      <text x="14" y="14" fill="var(--color-muted)" fontSize="5.5" fontFamily="var(--font-mono)">
        6 tribes · 18,442 followers
      </text>
    </svg>
  );
}

function CreativeVisual() {
  return (
    <div className="mx-auto flex h-36 w-56 flex-col gap-2 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="h-5 w-5 rounded-full bg-accent/20" />
        <span className="h-2 w-16 rounded bg-line-strong" />
      </div>
      <span className="h-2 w-40 rounded bg-line-strong" />
      <span className="h-2 w-32 rounded bg-line" />
      <div className="relative flex-1 overflow-hidden rounded-md border border-line bg-raised">
        <svg viewBox="0 0 200 60" className="h-full w-full text-line-strong" aria-hidden="true">
          <path d="M0 14 C 60 14, 76 8, 200 10" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M0 32 C 56 32, 84 26, 200 29" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M0 50 C 60 50, 74 54, 200 50" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
        <span className="absolute right-2 top-2 rounded border border-line bg-ground/70 px-1.5 py-0.5 font-mono text-xs text-faint">
          grok imagine
        </span>
      </div>
    </div>
  );
}

function TunnelVisual() {
  const rows: Array<[string, number, number]> = [
    ["likes", 45, 90],
    ["reposts", 20, 65],
    ["replies", 30, 85],
    ["bookmarks", 25, 95],
  ];
  return (
    <div className="mx-auto flex h-36 w-60 flex-col justify-center gap-3">
      <div className="flex justify-between font-mono text-xs text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: "#ffb02e" }} /> A · draft
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: "#2fd6f6" }} /> B · tailored
        </span>
      </div>
      {rows.map(([label, a, b]) => (
        <div key={label} className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-faint">
            <span>{label}</span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded bg-raised">
            <span className="absolute right-1/2 top-0 h-full rounded-l" style={{ width: `${a / 2}%`, background: "#ffb02e" }} />
            <span className="absolute left-1/2 top-0 h-full rounded-r" style={{ width: `${b / 2}%`, background: "#2fd6f6" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ShipVisual() {
  const rows = [
    ["Winner posted from your account", true],
    ["students-edtech-4388.csv exported", true],
    ["Ads custom audience ready", true],
  ] as const;
  return (
    <div className="mx-auto flex h-36 w-64 flex-col justify-center gap-2.5">
      {rows.map(([label, done]) => (
        <div key={label} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full text-ground ${done ? "bg-fg" : "bg-raised"}`}
          >
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12.5l5 5L20 6.5" />
            </svg>
          </span>
          <span className="font-mono text-xs text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

const FEATURES = [
  {
    tag: "Audience map",
    windowTitle: "audience.map",
    title: "See who actually follows you.",
    body: "AgentSim clusters your real followers into interest tribes, named, sized, and mapped, so you know exactly who you're talking to.",
    visual: <MapVisual />,
  },
  {
    tag: "Grok Imagine",
    windowTitle: "creative.studio",
    title: "Creative drafted for every tribe.",
    body: "Brief the copilot once. Grok drafts the post and renders the poster or teaser video, tuned to how each tribe reads.",
    visual: <CreativeVisual />,
  },
  {
    tag: "Wind tunnel",
    windowTitle: "windtunnel.run",
    title: "Pre-test before anything hits your feed.",
    body: "Simulated agents grounded in each tribe react to your draft and its tailored version. See the winner before you post for real.",
    visual: <TunnelVisual />,
  },
  {
    tag: "Ship",
    windowTitle: "deploy.log",
    title: "Post the winner. Export the audience.",
    body: "Publish from your own account, then export any tribe as an Ads-ready custom audience for paid reach.",
    visual: <ShipVisual />,
  },
];

/**
 * Landing. The Dashboard button and CTA kick off Sign in with X when OAuth is
 * configured; without credentials the start route passes straight through.
 */
export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex min-h-dvh flex-col overflow-hidden">
        <video
          src="/herosection.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-linear-to-b from-ground/60 via-ground/10 to-ground" />

        <header className="relative z-10 flex items-center gap-3 px-6 py-5">
          <span className="logo-mask block h-9 w-12 text-fg" aria-hidden="true" />
          <span className="text-xl font-semibold tracking-tight">AgentSim</span>
          <a
            href={AUTH_START}
            className="ml-auto rounded-full bg-fg px-6 py-2.5 text-[15px] font-semibold text-ground transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Dashboard
          </a>
        </header>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-20 text-center">
          <h1 className="max-w-4xl text-balance text-7xl font-semibold tracking-tight max-md:text-4xl">
            An accelerator for product launches on{" "}
            <span
              role="img"
              aria-label="X"
              className="inline-block h-[0.82em] w-[0.82em] translate-y-[0.06em] bg-fg"
              style={X_MASK}
            />
          </h1>
          <p className="mt-6 max-w-2xl text-balance text-lg leading-8 text-fg/85 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">
            AgentSim maps your real followers into tribes, tailors the post and poster to each one,
            and pre-tests the creative on a simulated audience before anything hits your feed.
          </p>
          <a
            href={AUTH_START}
            className="mt-10 flex items-center gap-2 rounded-full bg-fg px-7 py-3.5 text-base font-semibold text-ground transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Connect your{" "}
            <span
              role="img"
              aria-label="X"
              className="inline-block h-[0.85em] w-[0.85em] bg-ground"
              style={X_MASK}
            />{" "}
            account
            <ArrowRight size={17} strokeWidth={2.5} />
          </a>
        </div>
      </section>

      {/* ── What it does ─────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24 pt-4">
        <h2 className="text-3xl font-semibold tracking-tight max-md:text-2xl">
          From followers to a launch that lands.
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {FEATURES.map((f) => (
            <article
              key={f.tag}
              className="flex flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong"
            >
              <Window title={f.windowTitle}>{f.visual}</Window>
              <span className="mt-5 w-fit rounded border border-line px-1.5 py-px text-xs uppercase tracking-wide text-faint">
                {f.tag}
              </span>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted">{f.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
