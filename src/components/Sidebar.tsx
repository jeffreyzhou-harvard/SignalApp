"use client";

import { useState } from "react";
import { Check, Folder, FolderPlus, Pencil, Radar, Rocket, Settings, Trash2, X } from "lucide-react";
import { XLogo } from "./XLogo";
import type { ProjectFolder, PublicSettings } from "@/lib/types";

export function Sidebar({
  settings,
  onOpenSettings,
  active = "projects",
  folders,
  activeFolderId = "all",
  folderCounts,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: {
  settings: PublicSettings | null;
  onOpenSettings: () => void;
  active?: "projects" | "audience" | "deploys";
  /** Provide folders to render the organizer section (projects page only). */
  folders?: ProjectFolder[];
  activeFolderId?: string;
  folderCounts?: Record<string, number>;
  onSelectFolder?: (id: string) => void;
  onCreateFolder?: (name: string) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
}) {
  const linked = settings?.xAccount ?? null;
  const displayName = settings?.profile.name ?? null;
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const navClass = (isActive: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive ? "bg-raised font-medium text-fg" : "text-muted hover:bg-raised/50 hover:text-fg"
    }`;

  const submitCreate = () => {
    if (draft.trim()) onCreateFolder?.(draft);
    setDraft("");
    setCreating(false);
  };

  const submitRename = () => {
    if (renamingId && renameDraft.trim()) onRenameFolder?.(renamingId, renameDraft);
    setRenamingId(null);
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface max-md:hidden">
      <a href="/" className="flex items-center gap-2.5 px-4 pb-5 pt-5">
        <span className="logo-mask block h-7 w-9 text-fg" aria-hidden="true" />
        <span className="text-[15px] font-semibold tracking-tight">Signal</span>
      </a>

      <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
        <a
          href="/dashboard"
          aria-current={active === "projects" ? "page" : undefined}
          className={navClass(active === "projects")}
        >
          <Folder size={16} strokeWidth={2} className="text-muted" />
          Projects
        </a>
        <a
          href="/dashboard/audience"
          aria-current={active === "audience" ? "page" : undefined}
          className={navClass(active === "audience")}
        >
          <Radar size={16} strokeWidth={2} className="text-muted" />
          Audience Map
        </a>
        <a
          href="/dashboard/deploys"
          aria-current={active === "deploys" ? "page" : undefined}
          className={navClass(active === "deploys")}
        >
          <Rocket size={16} strokeWidth={2} className="text-muted" />
          Deploys
        </a>
      </nav>

      {folders && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col px-2">
          <div className="flex items-center justify-between px-3 pb-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-faint">Folders</span>
            <button
              onClick={() => {
                setCreating(true);
                setDraft("");
              }}
              aria-label="New folder"
              title="New folder"
              className="rounded-md p-1 text-muted transition-colors hover:bg-raised hover:text-fg"
            >
              <FolderPlus size={14} strokeWidth={2} />
            </button>
          </div>

          <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto pb-2">
            <button
              onClick={() => onSelectFolder?.("all")}
              className={`${navClass(activeFolderId === "all")} w-full text-left`}
            >
              All projects
              <span className="ml-auto text-xs text-faint">{folderCounts?.all ?? ""}</span>
            </button>
            <button
              onClick={() => onSelectFolder?.("unfiled")}
              className={`${navClass(activeFolderId === "unfiled")} w-full text-left`}
            >
              Unfiled
              <span className="ml-auto text-xs text-faint">{folderCounts?.unfiled ?? ""}</span>
            </button>

            {folders.map((f) =>
              renamingId === f.id ? (
                <form
                  key={f.id}
                  className="flex items-center gap-1 px-2 py-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitRename();
                  }}
                >
                  <input
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={submitRename}
                    autoFocus
                    aria-label="Folder name"
                    className="w-full rounded-md border border-line bg-raised px-2 py-1 text-sm focus:border-accent focus:outline-none"
                  />
                  <button type="submit" aria-label="Save folder name" className="rounded-md p-1 text-accent">
                    <Check size={13} strokeWidth={2.5} />
                  </button>
                </form>
              ) : (
                <div key={f.id} className="group relative">
                  <button
                    onClick={() => onSelectFolder?.(f.id)}
                    className={`${navClass(activeFolderId === f.id)} w-full pr-14 text-left`}
                  >
                    <span className="truncate">{f.name}</span>
                    <span className="ml-auto text-xs text-faint group-hover:opacity-0">
                      {folderCounts?.[f.id] ?? ""}
                    </span>
                  </button>
                  <span className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setRenamingId(f.id);
                        setRenameDraft(f.name);
                      }}
                      aria-label={`Rename ${f.name}`}
                      className="rounded p-1 text-muted hover:bg-overlay hover:text-fg"
                    >
                      <Pencil size={12} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => onDeleteFolder?.(f.id)}
                      aria-label={`Delete ${f.name}`}
                      className="rounded p-1 text-muted hover:bg-overlay hover:text-danger"
                    >
                      <Trash2 size={12} strokeWidth={2} />
                    </button>
                  </span>
                </div>
              )
            )}

            {creating && (
              <form
                className="flex items-center gap-1 px-2 py-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitCreate();
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={submitCreate}
                  autoFocus
                  placeholder="Folder name"
                  aria-label="New folder name"
                  className="w-full rounded-md border border-line bg-raised px-2 py-1 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCreating(false);
                    setDraft("");
                  }}
                  aria-label="Cancel"
                  className="rounded p-1 text-muted hover:text-fg"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              </form>
            )}

            <button
              onClick={() => onSelectFolder?.("trash")}
              className={`${navClass(activeFolderId === "trash")} w-full text-left`}
            >
              <Trash2 size={14} strokeWidth={2} className="shrink-0 text-muted" />
              Trash
              <span className="ml-auto text-xs text-faint">{folderCounts?.trash || ""}</span>
            </button>
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-line p-2">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-raised"
        >
          {linked ? (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                {(displayName ?? linked.handle).slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-fg">{displayName ?? `@${linked.handle}`}</span>
                <span className="block text-xs text-faint">
                  {displayName ? `@${linked.handle}` : "X account linked"}
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line-strong text-muted">
                <XLogo size={12} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-fg">{displayName ?? "Link your X account"}</span>
                <span className="block text-xs text-faint">
                  {displayName ? "Link your X account" : "Projects remember it"}
                </span>
              </span>
            </>
          )}
          <Settings size={16} strokeWidth={2} className="shrink-0 text-muted" aria-label="Settings" />
        </button>
      </div>
    </aside>
  );
}
