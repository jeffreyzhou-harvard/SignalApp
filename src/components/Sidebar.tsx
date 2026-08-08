"use client";

import { Folder, Radar, Rocket, Settings } from "lucide-react";
import { XLogo } from "./XLogo";
import type { AppSettings } from "@/lib/types";

export function Sidebar({
  settings,
  onOpenSettings,
}: {
  settings: AppSettings | null;
  onOpenSettings: () => void;
}) {
  const linked = settings?.xAccount ?? null;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface max-md:hidden">
      <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
        <span className="logo-mask block h-7 w-9 text-fg" aria-hidden="true" />
        <span className="text-[15px] font-semibold tracking-tight">AgentSim</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
        <a
          href="/"
          aria-current="page"
          className="flex items-center gap-2.5 rounded-lg bg-raised px-3 py-2 text-sm font-medium text-fg"
        >
          <Folder size={16} strokeWidth={2} className="text-muted" />
          Projects
        </a>
        <div
          className="flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-faint"
          title="Coming soon"
        >
          <Radar size={16} strokeWidth={2} />
          Audience map
          <span className="ml-auto rounded border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-faint">
            Soon
          </span>
        </div>
        <div
          className="flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-faint"
          title="Coming soon"
        >
          <Rocket size={16} strokeWidth={2} />
          Deploys
          <span className="ml-auto rounded border border-line px-1.5 py-px text-[10px] uppercase tracking-wide text-faint">
            Soon
          </span>
        </div>
      </nav>

      <div className="mt-auto border-t border-line p-2">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-raised"
        >
          {linked ? (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                {linked.handle.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-fg">@{linked.handle}</span>
                <span className="block text-xs text-faint">X account linked</span>
              </span>
            </>
          ) : (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line-strong text-muted">
                <XLogo size={12} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-fg">Link your X account</span>
                <span className="block text-xs text-faint">Projects remember it</span>
              </span>
            </>
          )}
          <Settings size={16} strokeWidth={2} className="shrink-0 text-muted" aria-label="Settings" />
        </button>
      </div>
    </aside>
  );
}
