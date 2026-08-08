"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Project } from "@/lib/types";
import { timeAgo } from "@/lib/format";

export function ProjectCard({
  project,
  index,
  onRename,
  onDelete,
}: {
  project: Project;
  index: number;
  onRename: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="group relative rise-in"
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
    >
      <Link
        href={`/p/${project.id}`}
        className="block overflow-hidden rounded-xl border border-line bg-surface transition-colors duration-200 hover:border-line-strong"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-raised">
          {project.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.thumbnail}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg viewBox="0 0 160 120" className="h-full w-full text-line" aria-hidden="true">
                <path d="M0 28 C 50 28, 66 20, 160 24" fill="none" stroke="currentColor" strokeWidth="1" />
                <path d="M0 60 C 46 60, 70 52, 160 56" fill="none" stroke="currentColor" strokeWidth="1" />
                <path d="M0 92 C 50 92, 64 100, 160 94" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
              <span className="absolute text-3xl font-semibold tracking-tight text-muted">
                {project.title.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className="px-3.5 py-3">
          <p className="truncate text-sm font-medium text-fg">{project.title}</p>
          <p className="mt-0.5 text-xs text-faint">Edited {timeAgo(project.updatedAt)}</p>
        </div>
      </Link>

      <div className="absolute right-2 top-2">
        <button
          aria-label={`Options for ${project.title}`}
          onClick={(e) => {
            e.preventDefault();
            setMenuOpen((v) => !v);
          }}
          className={`rounded-md border border-line bg-ground/80 p-1.5 text-muted backdrop-blur transition-opacity hover:text-fg ${
            menuOpen
              ? "opacity-100"
              : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
          }`}
        >
          <MoreHorizontal size={15} strokeWidth={2} />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-line-strong bg-overlay py-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)]">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onRename(project);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-fg hover:bg-raised"
              >
                <Pencil size={13} strokeWidth={2} className="text-muted" />
                Rename
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(project);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-danger hover:bg-raised"
              >
                <Trash2 size={13} strokeWidth={2} />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
