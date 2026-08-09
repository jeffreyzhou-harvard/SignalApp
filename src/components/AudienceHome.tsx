"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MessageCircle, Settings } from "lucide-react";
import type { PublicSettings } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { SettingsDialog } from "./SettingsDialog";
import { AudienceChatPanel } from "./galaxy/AudienceChatPanel";

const GalaxyView = dynamic(() => import("./galaxy/GalaxyView").then((m) => m.GalaxyView), {
  ssr: false,
});

/**
 * The dashboard's Audience Map tab: the same galaxy the campaign workflow
 * uses (same AudienceProvider snapshot), visualization only — no campaign card.
 */
export function AudienceHome() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [focusCluster, setFocusCluster] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  // Follow the map's selection so the chat can focus on the niche in view.
  useEffect(() => {
    const onSelected = (e: Event) => {
      const { clusterId, label } = (e as CustomEvent<{ clusterId: string | null; label: string | null }>).detail;
      setFocusCluster(clusterId && label ? { id: clusterId, label } : null);
    };
    window.addEventListener("agentsim:cluster-selected", onSelected);
    return () => window.removeEventListener("agentsim:cluster-selected", onSelected);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar settings={settings} onOpenSettings={() => setShowSettings(true)} active="audience" />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-6 py-3.5 max-md:px-4">
          <span className="logo-mask block h-5 w-6 text-fg md:hidden" aria-hidden="true" />
          <h1 className="text-[15px] font-semibold tracking-tight">Audience Map</h1>
          <button
            onClick={() => setChatOpen((v) => !v)}
            aria-label="Ask your audience"
            className={`ml-auto flex items-center gap-1.5 rounded-lg border p-2 text-sm font-medium transition-colors md:px-3 ${
              chatOpen
                ? "border-line-strong bg-raised text-fg"
                : "border-line text-muted hover:border-line-strong hover:text-fg"
            }`}
          >
            <MessageCircle size={16} strokeWidth={2} />
            <span className="max-md:hidden">Ask</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className="rounded-lg border border-line p-2 text-muted transition-colors hover:border-line-strong hover:text-fg md:hidden"
          >
            <Settings size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <GalaxyView />
          </div>
          {chatOpen && (
            <AudienceChatPanel focusCluster={focusCluster} onClose={() => setChatOpen(false)} />
          )}
        </div>
      </main>

      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => setSettings(s)}
        />
      )}
    </div>
  );
}
