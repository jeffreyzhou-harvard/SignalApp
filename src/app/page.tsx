import { ArrowRight } from "lucide-react";
import { FeatureCards } from "@/components/landing/FeatureCards";

const AUTH_START = "/api/auth/x/start?returnTo=/dashboard";

const X_MASK = {
  mask: "url(/X_icon.png) no-repeat center / contain",
  WebkitMask: "url(/X_icon.png) no-repeat center / contain",
};

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
            AgentSim maps your real followers into niches, tailors the post and poster to each one,
            and A/B tests the creative on a simulated audience before anything hits your feed.
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
      <section className="mx-auto w-full max-w-6xl px-6 pb-24 pt-4">
        <h2 className="text-3xl font-semibold tracking-tight max-md:text-2xl">
          From followers to a launch that lands.
        </h2>
        <FeatureCards />
      </section>
    </div>
  );
}
