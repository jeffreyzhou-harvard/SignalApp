"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Settings } from "lucide-react";
import type { Project, PublicSettings } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { ProjectCard } from "./ProjectCard";
import { EmptyState } from "./EmptyState";
import { NewProjectDialog } from "./NewProjectDialog";
import { SettingsDialog } from "./SettingsDialog";
import { Dialog } from "./Dialog";

export function ProjectsHome() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleting, setDeleting] = useState<Project | null>(null);

  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [pRes, sRes] = await Promise.all([fetch("/api/projects"), fetch("/api/settings")]);
      if (!pRes.ok || !sRes.ok) throw new Error("load failed");
      setProjects(await pRes.json());
      setSettings(await sRes.json());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!projects) return null;
    const q = query.trim().toLowerCase();
    return q ? projects.filter((p) => p.title.toLowerCase().includes(q)) : projects;
  }, [projects, query]);

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming || !renameTitle.trim()) return;
    await fetch(`/api/projects/${renaming.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameTitle }),
    });
    setRenaming(null);
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    await fetch(`/api/projects/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    load();
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar settings={settings} onOpenSettings={() => setShowSettings(true)} />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-6 py-3.5 max-md:px-4">
          <span className="logo-mask block h-5 w-6 text-fg md:hidden" aria-hidden="true" />
          <h1 className="text-[15px] font-semibold tracking-tight">Projects</h1>
          <div className="relative ml-auto w-56 max-md:w-40">
            <Search
              size={14}
              strokeWidth={2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search projects"
              className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-3 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-fg px-4 py-2 text-[13px] font-semibold text-ground transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            <Plus size={15} strokeWidth={2.5} />
            New project
          </button>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title={settings?.xAccount ? `Settings · @${settings.xAccount.handle}` : "Settings · link your X account"}
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-line-strong hover:text-fg md:hidden"
          >
            <Settings size={16} strokeWidth={2} />
          </button>
        </header>

        {loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-24 text-center">
            <p className="text-sm font-medium">Couldn’t load your projects.</p>
            <p className="text-[13px] text-muted">The server didn’t answer. It may still be starting.</p>
            <button
              onClick={load}
              className="mt-2 rounded-full bg-fg px-5 py-2 text-sm font-semibold text-ground"
            >
              Try again
            </button>
          </div>
        ) : filtered === null ? (
          <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start gap-5 overflow-y-auto p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="aspect-[4/3] animate-pulse bg-raised" />
                <div className="space-y-2 px-3.5 py-3">
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-raised" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-raised" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 && !query ? (
          <EmptyState onNewProject={() => setShowNew(true)} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
            <p className="text-sm font-medium">No projects match “{query}”</p>
            <p className="mt-1 text-[13px] text-muted">Try a different search, or create it fresh.</p>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start gap-5 overflow-y-auto p-6">
            {filtered.map((project, i) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={i}
                onRename={(p) => {
                  setRenaming(p);
                  setRenameTitle(p.title);
                }}
                onDelete={(p) => setDeleting(p)}
              />
            ))}
          </div>
        )}
      </main>

      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => setSettings(s)}
        />
      )}

      {renaming && (
        <Dialog title="Rename project" onClose={() => setRenaming(null)}>
          <form onSubmit={submitRename}>
            <input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              aria-label="Project title"
              className="w-full rounded-lg border border-line bg-raised px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenaming(null)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!renameTitle.trim()}
                className="rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-ground disabled:opacity-40"
              >
                Rename
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {deleting && (
        <Dialog title="Delete project" onClose={() => setDeleting(null)}>
          <p className="text-sm leading-6 text-muted">
            Delete <span className="font-medium text-fg">“{deleting.title}”</span> and its whole
            conversation? This can’t be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setDeleting(null)}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-ground"
            >
              Delete
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
