"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "./Dialog";

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create the project.");
      router.push(`/p/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project.");
      setBusy(false);
    }
  }

  return (
    <Dialog title="New project" onClose={onClose}>
      <form onSubmit={create}>
        <label htmlFor="project-title" className="text-[13px] font-medium text-muted">
          What are you launching?
        </label>
        <input
          id="project-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Nova API launch, September"
          autoComplete="off"
          className="mt-2 w-full rounded-lg border border-line bg-raised px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-ground transition-opacity disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create & open chat"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
