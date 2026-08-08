"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownAZ, Check, Clock, Plus, Search, Settings, SlidersHorizontal } from "lucide-react";
import type { Project, ProjectFolder, PublicSettings } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { ProjectCard } from "./ProjectCard";
import { EmptyState } from "./EmptyState";
import { NewProjectDialog } from "./NewProjectDialog";
import { SettingsDialog } from "./SettingsDialog";
import { Dialog } from "./Dialog";

type SortMode = "recent" | "name";

export function ProjectsHome() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [query, setQuery] = useState("");
  const [folderSel, setFolderSel] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [filterOpen, setFilterOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [moving, setMoving] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [pRes, sRes, fRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/settings"),
        fetch("/api/folders"),
      ]);
      if (!pRes.ok || !sRes.ok || !fRes.ok) throw new Error("load failed");
      setProjects(await pRes.json());
      setSettings(await sRes.json());
      setFolders(await fRes.json());
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
    let list = projects;
    if (folderSel === "unfiled") list = list.filter((p) => !p.folderId);
    else if (folderSel !== "all") list = list.filter((p) => p.folderId === folderSel);
    if (q) list = list.filter((p) => p.title.toLowerCase().includes(q));
    return [...list].sort((a, b) =>
      sort === "name" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [projects, query, folderSel, sort]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { all: projects?.length ?? 0, unfiled: 0 };
    for (const p of projects ?? []) {
      if (p.folderId) counts[p.folderId] = (counts[p.folderId] ?? 0) + 1;
      else counts.unfiled++;
    }
    return counts;
  }, [projects]);

  const activeFolder = folders.find((f) => f.id === folderSel) ?? null;

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

  async function moveTo(folderId: string | null) {
    if (!moving) return;
    await fetch(`/api/projects/${moving.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    setMoving(null);
    load();
  }

  async function createFolder(name: string) {
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    load();
  }

  async function renameFolder(id: string, name: string) {
    await fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    load();
  }

  async function deleteFolder(id: string) {
    await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (folderSel === id) setFolderSel("all");
    load();
  }

  const ghostCard = (
    <button
      onClick={() => setShowNew(true)}
      className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-muted transition-colors hover:border-line-strong hover:bg-raised/40 hover:text-fg"
    >
      <Plus size={18} strokeWidth={2} />
      <span className="text-xs font-medium">New project</span>
    </button>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        settings={settings}
        onOpenSettings={() => setShowSettings(true)}
        active="projects"
        folders={folders}
        activeFolderId={folderSel}
        folderCounts={folderCounts}
        onSelectFolder={setFolderSel}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-6 py-3.5 max-md:px-4">
          <span className="logo-mask block h-5 w-6 text-fg md:hidden" aria-hidden="true" />
          <h1 className="text-[15px] font-semibold tracking-tight">
            {activeFolder ? activeFolder.name : folderSel === "unfiled" ? "Unfiled" : "Projects"}
          </h1>
          <div className="relative ml-auto w-56 max-md:w-36">
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

          <div className="relative">
            <button
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              aria-label="Filter and sort"
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                filterOpen || sort !== "recent" || folderSel === "unfiled"
                  ? "border-line-strong bg-raised text-fg"
                  : "border-line text-muted hover:border-line-strong hover:text-fg"
              }`}
            >
              <SlidersHorizontal size={14} strokeWidth={2} />
              <span className="max-md:hidden">{sort === "name" ? "A to Z" : "Recent"}</span>
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-line-strong bg-overlay p-1.5 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]">
                  <p className="px-2.5 pb-1 pt-1.5 text-xs uppercase tracking-wide text-faint">Sort by</p>
                  {(
                    [
                      { id: "recent", label: "Last edited", icon: <Clock size={13} strokeWidth={2} /> },
                      { id: "name", label: "Name", icon: <ArrowDownAZ size={13} strokeWidth={2} /> },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setSort(o.id);
                        setFilterOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-raised"
                    >
                      <span className="text-muted">{o.icon}</span>
                      {o.label}
                      {sort === o.id && <Check size={13} strokeWidth={2.5} className="ml-auto text-accent" />}
                    </button>
                  ))}
                  <p className="border-t border-line px-2.5 pb-1 pt-2 text-xs uppercase tracking-wide text-faint">
                    Show
                  </p>
                  {(
                    [
                      { id: "all", label: "All projects" },
                      { id: "unfiled", label: "Unfiled only" },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setFolderSel(o.id);
                        setFilterOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-fg transition-colors hover:bg-raised"
                    >
                      {o.label}
                      {folderSel === o.id && <Check size={13} strokeWidth={2.5} className="ml-auto text-accent" />}
                    </button>
                  ))}
                </div>
              </>
            )}
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
        ) : filtered.length === 0 && !query && folderSel === "all" ? (
          <EmptyState onNewProject={() => setShowNew(true)} />
        ) : filtered.length === 0 && query ? (
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
                onMove={(p) => setMoving(p)}
              />
            ))}
            {ghostCard}
          </div>
        )}
      </main>

      {showNew && (
        <NewProjectDialog
          onClose={() => setShowNew(false)}
          folderId={activeFolder ? activeFolder.id : null}
        />
      )}
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

      {moving && (
        <Dialog title={`Move “${moving.title}”`} onClose={() => setMoving(null)}>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => moveTo(null)}
              className="flex items-center rounded-lg border border-line px-3.5 py-2.5 text-left text-sm transition-colors hover:border-line-strong hover:bg-raised/50"
            >
              Unfiled
              {!moving.folderId && <Check size={14} strokeWidth={2.5} className="ml-auto text-accent" />}
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => moveTo(f.id)}
                className="flex items-center rounded-lg border border-line px-3.5 py-2.5 text-left text-sm transition-colors hover:border-line-strong hover:bg-raised/50"
              >
                <span className="truncate">{f.name}</span>
                {moving.folderId === f.id && <Check size={14} strokeWidth={2.5} className="ml-auto text-accent" />}
              </button>
            ))}
            {folders.length === 0 && (
              <p className="px-1 py-2 text-[13px] text-muted">
                No folders yet — create one from the sidebar.
              </p>
            )}
          </div>
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
