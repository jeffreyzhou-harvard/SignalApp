import { ArrowRight } from "lucide-react";

const AUTH_START = "/api/auth/x/start?returnTo=/dashboard";

/**
 * Minimal landing. The Dashboard button kicks off Sign in with X when OAuth
 * is configured; without credentials the start route passes straight through.
 */
export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2.5 px-6 py-5">
        <span className="logo-mask block h-6 w-8 text-fg" aria-hidden="true" />
        <span className="text-[15px] font-semibold tracking-tight">AgentSim</span>
        <a
          href={AUTH_START}
          className="ml-auto rounded-full bg-fg px-4 py-2 text-[13px] font-semibold text-ground transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          Dashboard
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <div className="relative mb-10 w-110 max-w-full" aria-hidden="true">
          <svg viewBox="0 0 560 170" className="w-full text-line-strong">
            {[
              { d: "M0 30 C 160 30, 200 16, 560 22", delay: "0s" },
              { d: "M0 70 C 150 70, 220 54, 560 62", delay: "0.12s" },
              { d: "M0 110 C 160 110, 210 122, 560 112", delay: "0.24s" },
              { d: "M0 150 C 150 150, 200 160, 560 154", delay: "0.36s" },
            ].map((line) => (
              <path
                key={line.d}
                d={line.d}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="streamline"
                style={{ animationDelay: line.delay }}
              />
            ))}
          </svg>
          <span
            className="absolute left-[63%] top-1/2 block h-16 w-16 -translate-y-1/2 bg-muted"
            style={{
              mask: "url(/X_icon.png) no-repeat center / contain",
              WebkitMask: "url(/X_icon.png) no-repeat center / contain",
            }}
          />
        </div>

        <h1 className="max-w-2xl text-balance text-5xl font-semibold tracking-tight max-md:text-4xl">
          A wind tunnel for product launches on X
        </h1>
        <p className="mt-5 max-w-xl text-balance text-base leading-7 text-muted">
          AgentSim maps your real followers into tribes, tailors the post and poster to each one,
          and pre-tests the creative on a simulated audience before anything hits your feed.
        </p>
        <a
          href={AUTH_START}
          className="mt-9 flex items-center gap-2 rounded-full bg-fg px-6 py-3 text-sm font-semibold text-ground transition-transform hover:scale-[1.03] active:scale-[0.98]"
        >
          Connect your X account
          <ArrowRight size={16} strokeWidth={2.5} />
        </a>
      </main>

    </div>
  );
}
