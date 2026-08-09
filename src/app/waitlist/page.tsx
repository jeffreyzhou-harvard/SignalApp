"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

/**
 * Private-beta waitlist. Signal isn't publicly accessible yet, so both landing
 * CTAs route here; submissions go to Formspree.
 */
const FORMSPREE_URL = "https://formspree.io/f/mrpzpprd";

export default function Waitlist() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(FORMSPREE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email, company }),
      });
      if (!res.ok) throw new Error("Submission failed. Try again in a moment.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      <header className="flex items-center gap-2 px-6 py-5">
        <Link
          href="/"
          aria-label="Back to home"
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-raised hover:text-fg"
        >
          <ArrowLeft size={17} strokeWidth={2} />
        </Link>
        <span className="logo-mask block h-7 w-6 text-fg" aria-hidden="true" />
        <span className="text-[15px] font-semibold tracking-tight">Signal</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-md rise-in">
          {done ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-8 py-12 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-fg text-ground">
                <Check size={20} strokeWidth={2.5} />
              </span>
              <h1 className="text-xl font-semibold tracking-tight">You&apos;re on the list.</h1>
              <p className="text-sm leading-6 text-muted">
                We&apos;ll reach out at your email as beta access opens up. Thanks for wanting to
                launch with Signal.
              </p>
              <Link href="/" className="mt-2 text-sm font-medium text-accent hover:underline">
                Back to home
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-semibold tracking-tight max-md:text-2xl">
                Join the waitlist
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted">
                Signal is in private beta while we wind-tunnel the wind tunnel. Leave your details
                and we&apos;ll bring you in as launches open up.
              </p>

              <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-faint">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Ada Lovelace"
                    className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-faint">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="ada@company.com"
                    className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-faint">Company</span>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Where you're launching from"
                    className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </label>

                <button
                  type="submit"
                  disabled={busy || !name.trim() || !email.trim()}
                  className="mt-2 flex items-center justify-center gap-2 rounded-full bg-fg px-6 py-3 text-[15px] font-semibold text-ground transition-transform enabled:hover:scale-[1.02] enabled:active:scale-[0.98] disabled:opacity-40"
                >
                  {busy ? "Joining…" : "Join the waitlist"}
                  {!busy && <ArrowRight size={16} strokeWidth={2.5} />}
                </button>
                {error && (
                  <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] leading-5 text-danger">
                    {error}
                  </p>
                )}
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
