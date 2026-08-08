"use client";

import { useState } from "react";
import { Check, Unlink } from "lucide-react";
import { Dialog } from "./Dialog";
import { XLogo } from "./XLogo";
import type { AppSettings } from "@/lib/types";

export function SettingsDialog({
  settings,
  onClose,
  onSaved,
}: {
  settings: AppSettings | null;
  onClose: () => void;
  onSaved: (s: AppSettings) => void;
}) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = settings?.xAccount ?? null;

  async function putSettings(body: { xHandle: string | null }) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong saving settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Settings" onClose={onClose}>
      <section aria-label="X account">
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

        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
        {!linked && (
          <p className="mt-3 text-xs leading-5 text-faint">
            Stored locally for now. X sign-in (OAuth) drops into this same slot later.
          </p>
        )}
      </section>

      <section aria-label="Model providers" className="mt-5 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Model providers</h3>
        <dl className="mt-2.5 space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted">Chat</dt>
            <dd className="font-mono text-xs text-fg">Grok · grok-4.5</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Images</dt>
            <dd className="font-mono text-xs text-fg">Grok Imagine</dd>
          </div>
        </dl>
        <p className="mt-2.5 text-xs leading-5 text-faint">
          Providers are pluggable: set AI_TEXT_PROVIDER / AI_IMAGE_PROVIDER in .env.local to swap
          them.
        </p>
      </section>
    </Dialog>
  );
}
