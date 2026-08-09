"use client";

import { useEffect, useState } from "react";
import { Check, Orbit, Unlink } from "lucide-react";
import { Dialog } from "./Dialog";
import { XLogo } from "./XLogo";
import { STYLE_PRESETS } from "@/lib/styles";
import type { PublicSettings } from "@/lib/types";

export function SettingsDialog({
  settings,
  onClose,
  onSaved,
}: {
  settings: PublicSettings | null;
  onClose: () => void;
  onSaved: (s: PublicSettings) => void;
}) {
  const [handle, setHandle] = useState("");
  const [name, setName] = useState(settings?.profile.name ?? "");
  const [nameSaved, setNameSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = settings?.xAccount ?? null;
  const defaults = settings?.defaults ?? { style: "none", resolution: "1k" as const };
  const audienceHandle = settings?.audienceHandle ?? null;
  const [audiences, setAudiences] = useState<{ handle: string; personas: number }[]>([]);

  // Available audience maps (ingested seeds with clusters) for the demo toggle.
  useEffect(() => {
    let dead = false;
    fetch("/api/audiences")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!dead && Array.isArray(rows)) setAudiences(rows);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);

  async function putSettings(body: Record<string, unknown>, opts?: { markName?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong saving settings.");
      onSaved(json);
      setHandle("");
      if (opts?.markName) {
        setNameSaved(true);
        setTimeout(() => setNameSaved(false), 1600);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong saving settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Settings" onClose={onClose} width="w-[30rem]">
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        {/* ── Profile ─────────────────────────────────────────── */}
        <section aria-label="Profile">
          <h3 className="text-sm font-semibold">Profile</h3>
          <p className="mt-1 text-[13px] leading-5 text-muted">
            How the copilot addresses you across projects.
          </p>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              putSettings({ name }, { markName: true });
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Display name"
              className="flex-1 rounded-lg border border-line bg-raised px-3.5 py-2 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || name === (settings?.profile.name ?? "")}
              className="flex items-center gap-1.5 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-ground transition-opacity disabled:opacity-40"
            >
              {nameSaved ? <Check size={14} strokeWidth={2.5} /> : null}
              {nameSaved ? "Saved" : "Save"}
            </button>
          </form>
        </section>

        {/* ── X account ───────────────────────────────────────── */}
        <section aria-label="X account" className="border-t border-line pt-4">
          <div className="flex items-center gap-2">
            <XLogo size={14} className="text-fg" />
            <h3 className="text-sm font-semibold">X account</h3>
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-muted">
            Your projects hang off this account. The copilot targets its audience and remembers it
            across sessions.
          </p>

          {linked ? (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-raised px-3.5 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                {linked.handle.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  @{linked.handle}
                  <Check size={14} strokeWidth={2.5} className="text-accent" aria-label="Linked" />
                </p>
                <p className="text-xs text-faint">
                  Linked {new Date(linked.linkedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => putSettings({ xHandle: null })}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50"
              >
                <Unlink size={12} strokeWidth={2} />
                Unlink
              </button>
            </div>
          ) : settings?.auth.mode === "redirect" ? (
            <a
              href={`${settings.auth.startUrl}?returnTo=${encodeURIComponent(
                typeof window !== "undefined" ? window.location.pathname : "/dashboard"
              )}`}
              className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-fg px-4 py-2.5 text-sm font-semibold text-ground transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <XLogo size={14} className="text-ground" />
              Sign in with X
            </a>
          ) : (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (handle.trim()) putSettings({ xHandle: handle });
              }}
            >
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">
                  @
                </span>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="yourhandle"
                  aria-label="X handle"
                  className="w-full rounded-lg border border-line bg-raised py-2 pl-8 pr-3 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !handle.trim()}
                className="rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-ground transition-opacity disabled:opacity-40"
              >
                {busy ? "Linking…" : "Link"}
              </button>
            </form>
          )}

          {!linked && (
            <p className="mt-3 text-xs leading-5 text-faint">
              {settings?.auth.mode === "redirect"
                ? "You'll authorize Signal to read your audience and post only when you say ship."
                : "Stored locally for now. Sign in with X activates when OAuth credentials are configured."}
            </p>
          )}
        </section>

        {/* ── Audience map ────────────────────────────────────── */}
        {audiences.length > 0 && (
          <section aria-label="Audience map" className="border-t border-line pt-4">
            <div className="flex items-center gap-2">
              <Orbit size={14} strokeWidth={2} className="text-fg" />
              <h3 className="text-sm font-semibold">Audience map</h3>
            </div>
            <p className="mt-1 text-[13px] leading-5 text-muted">
              Which follower graph the galaxy shows. Auto follows your linked account; pick a seed
              to explore its audience instead.
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              <button
                onClick={() => putSettings({ audienceHandle: null })}
                disabled={busy}
                aria-pressed={audienceHandle === null}
                className={`flex items-center rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                  audienceHandle === null
                    ? "border-line-strong bg-raised"
                    : "border-line hover:border-line-strong hover:bg-raised/50"
                }`}
              >
                <span className="font-medium">Auto</span>
                <span className="ml-2 text-xs text-faint">
                  {linked ? `follows @${linked.handle}` : "follows your linked account"}
                </span>
                {audienceHandle === null && (
                  <Check size={14} strokeWidth={2.5} className="ml-auto text-accent" />
                )}
              </button>
              {audiences.map((a) => {
                const active = audienceHandle?.toLowerCase() === a.handle.toLowerCase();
                return (
                  <button
                    key={a.handle}
                    onClick={() => putSettings({ audienceHandle: a.handle })}
                    disabled={busy}
                    aria-pressed={active}
                    className={`flex items-center rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                      active
                        ? "border-line-strong bg-raised"
                        : "border-line hover:border-line-strong hover:bg-raised/50"
                    }`}
                  >
                    <span className="font-medium">@{a.handle}</span>
                    <span className="ml-2 text-xs text-faint">
                      {a.personas.toLocaleString()} followers mapped
                    </span>
                    {active && <Check size={14} strokeWidth={2.5} className="ml-auto text-accent" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Creative defaults ───────────────────────────────── */}
        <section aria-label="Creative defaults" className="border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Creative defaults</h3>
          <p className="mt-1 text-[13px] leading-5 text-muted">
            Every new render starts from these. You can still change them per prompt in the composer.
          </p>
          <div className="mt-3">
            <p className="text-xs uppercase tracking-wide text-faint">Style</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => putSettings({ defaults: { ...defaults, style: s.id } })}
                  disabled={busy}
                  aria-pressed={defaults.style === s.id}
                  title={s.hint}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    defaults.style === s.id
                      ? "border-line-strong bg-raised text-fg"
                      : "border-line text-muted hover:border-line-strong hover:text-fg"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-faint">Image resolution</p>
            <div className="flex items-center rounded-lg border border-line p-0.5">
              {(["1k", "2k"] as const).map((res) => (
                <button
                  key={res}
                  onClick={() => putSettings({ defaults: { ...defaults, resolution: res } })}
                  disabled={busy}
                  aria-pressed={defaults.resolution === res}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
                    defaults.resolution === res ? "bg-raised text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Model providers ─────────────────────────────────── */}
        <section aria-label="Model providers" className="border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Model providers</h3>
          <dl className="mt-2.5 space-y-1.5 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted">Chat</dt>
              <dd className="font-mono text-xs text-fg">Grok · grok-4.5</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Images</dt>
              <dd className="font-mono text-xs text-fg">Grok Imagine · quality</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Video</dt>
              <dd className="font-mono text-xs text-fg">Grok Imagine · 1.5</dd>
            </div>
          </dl>
          <p className="mt-2.5 text-xs leading-5 text-faint">
            Providers are pluggable: set AI_TEXT_PROVIDER / AI_IMAGE_PROVIDER / AI_VIDEO_PROVIDER in
            .env.local to swap them.
          </p>
        </section>

        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
