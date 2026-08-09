"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Settings } from "lucide-react";
import type { PublicSettings } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { SettingsDialog } from "./SettingsDialog";
import { VoiceDock } from "./VoiceDock";

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

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar settings={settings} onOpenSettings={() => setShowSettings(true)} active="audience" />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-6 py-3.5 max-md:px-4">
          <span className="logo-mask block h-5 w-6 text-fg md:hidden" aria-hidden="true" />
          <h1 className="text-[15px] font-semibold tracking-tight">Audience Map</h1>
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            className="ml-auto rounded-lg border border-line p-2 text-muted transition-colors hover:border-line-strong hover:text-fg md:hidden"
          >
            <Settings size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="min-h-0 flex-1">
          <GalaxyView />
        </div>
      </main>

      {showSettings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => setSettings(s)}
        />
      )}
      <VoiceDock />
    </div>
  );
}
