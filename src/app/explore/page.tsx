"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GalaxyView } from "@/components/galaxy/GalaxyView";
import { EXPLORE_AUDIENCES, DEFAULT_EXPLORE_HANDLE } from "@/lib/audience/explore";

/**
 * The signed-out audience map. Anyone can open a real clustered audience,
 * click into a tribe, and read a real follower's persona — the fastest way to
 * understand what Signal does without an account.
 */
export default function Explore() {
  const [handle, setHandle] = useState(DEFAULT_EXPLORE_HANDLE);

  return (
    <div className="flex h-dvh flex-col bg-ground">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-line px-5 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="logo-mask block h-7 w-6 text-fg" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">Signal</span>
        </Link>

        <div
          role="group"
          aria-label="Choose an audience"
          className="flex items-center gap-1 rounded-full border border-line bg-surface p-1"
        >
          {EXPLORE_AUDIENCES.map((a) => (
            <button
              key={a.handle}
              onClick={() => setHandle(a.handle)}
              aria-pressed={a.handle === handle}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                a.handle === handle
                  ? "bg-fg text-ground"
                  : "text-muted hover:text-fg"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>

        <Link
          href="/waitlist"
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-fg px-4 py-2 text-[13px] font-semibold text-ground transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          Join the waitlist
          <ArrowRight size={15} strokeWidth={2.5} />
        </Link>
      </header>

      <main className="relative min-h-0 flex-1">
        {/* Remount per audience so the galaxy re-runs its intro instead of
            morphing one set of tribes into another. */}
        <GalaxyView key={handle} source="explore" exploreHandle={handle} />
      </main>
    </div>
  );
}
