"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { AudienceMember, AudienceSnapshot } from "@/lib/audience/types";
import { ensureSnapshot, getCachedSnapshot } from "@/lib/audience/snapshot-cache";
import { GalaxyScene } from "./Scene";
import { CampaignPanel, type PanelStage } from "./CampaignPanel";
import { MemberProfileCard } from "./MemberProfileCard";

/**
 * The audience map + campaign card: the galaxy renders whatever the registered
 * AudienceProvider serves, and the right-hand panel drives the campaign flow
 * (target → creative → wind tunnel → verdict). Self-contained — drop it
 * anywhere with a sized parent.
 */
export function GalaxyView({
  projectId,
  xHandle,
  displayName,
  seedCopy,
}: {
  projectId?: string;
  xHandle?: string | null;
  displayName?: string | null;
  /** Copy iterated in chat, sent back to seed the next wind-tunnel run. */
  seedCopy?: string | null;
}) {
  // Paint from cache immediately so revisiting the map doesn't re-download the
  // whole audience; the effect below revalidates in the background.
  const [snapshot, setSnapshot] = useState<AudienceSnapshot | null>(() =>
    getCachedSnapshot({ projectId }),
  );
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<PanelStage>("target");
  const [simRunning, setSimRunning] = useState(false);
  const [profileMember, setProfileMember] = useState<AudienceMember | null>(null);

  // The voice copilot's focus_cluster tool zooms the map exactly like a click.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const { clusterId } = (e as CustomEvent<{ clusterId: string }>).detail;
      if (snapshot?.clusters.some((c) => c.id === clusterId)) setSelected(clusterId);
    };
    window.addEventListener("agentsim:focus-cluster", onFocus);
    return () => window.removeEventListener("agentsim:focus-cluster", onFocus);
  }, [snapshot]);

  // Broadcast the current selection so the "ask your audience" chat can scope
  // its answers to whichever niche the founder is looking at (null = overview).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("agentsim:cluster-selected", {
        detail: {
          clusterId: selected,
          label: selected ? snapshot?.clusters.find((c) => c.id === selected)?.label ?? null : null,
        },
      }),
    );
  }, [selected, snapshot]);

  useEffect(() => {
    let dead = false;
    const params = { projectId };
    // Instant paint from cache on revisit; the retry button forces a refetch.
    const cached = getCachedSnapshot(params);
    if (cached) {
      setSnapshot(cached);
      setFailed(false);
    }
    ensureSnapshot(params, { force: attempt > 0 })
      .then((s) => {
        if (!dead) {
          setSnapshot(s);
          setFailed(false);
        }
      })
      .catch(() => {
        // Only surface failure when there's nothing cached to show.
        if (!dead && !getCachedSnapshot(params)) setFailed(true);
      });
    return () => {
      dead = true;
    };
  }, [projectId, xHandle, attempt]);

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium">Couldn’t load the audience map.</p>
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="rounded-full bg-fg px-5 py-2 text-sm font-semibold text-ground"
        >
          Try again
        </button>
      </div>
    );
  }

  // Without a projectId this is the standalone audience map: pure visualization,
  // no campaign card. With one, selection locks once the panel moves past targeting.
  const vizOnly = !projectId;
  const canRetarget = vizOnly || stage === "target" || stage === "brief";
  const selectedCluster = snapshot?.clusters.find((c) => c.id === selected) ?? null;

  return (
    <div className="relative h-full w-full overflow-hidden rise-in">
      <Canvas camera={{ position: [0, 9, 44], fov: 50 }} dpr={[1, 2]}>
        {snapshot && (
          <GalaxyScene
            clusters={snapshot.clusters}
            members={snapshot.members}
            selectedId={selected}
            pulseClusterId={simRunning ? selected : null}
            shifted={!vizOnly}
            onPick={(id) => {
              if (canRetarget) setSelected(id);
            }}
            onPickMember={setProfileMember}
          />
        )}
      </Canvas>

      {!snapshot && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-2 text-sm text-muted">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="thinking-dot block h-1.5 w-1.5 rounded-full bg-muted"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
            Mapping your audience
          </span>
        </div>
      )}

      {snapshot && (
        <>
          <div
            className={`absolute left-4 top-4 flex flex-col gap-1.5 max-md:right-4 max-md:flex-row max-md:overflow-x-auto max-md:pb-1 ${
              vizOnly ? "" : "md:max-w-[calc(100%-600px)]"
            }`}
          >
            {snapshot.clusters.map((c) => {
              const active = selected === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => canRetarget && setSelected(active ? null : c.id)}
                  disabled={!canRetarget}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors disabled:opacity-60 ${
                    active
                      ? "border-line-strong bg-raised text-fg"
                      : "border-line bg-surface/70 text-muted enabled:hover:border-line-strong enabled:hover:text-fg"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                  {c.label}
                  <span className="text-faint">{c.members.toLocaleString()}</span>
                </button>
              );
            })}
          </div>

          <div className="absolute bottom-4 left-4 flex items-center gap-2 max-md:hidden">
            {snapshot.synthetic && (
              <span
                className="rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs text-faint backdrop-blur"
                title="Seeded sample audience. The real clustering pipeline plugs in via AUDIENCE_PROVIDER."
              >
                Sample data
              </span>
            )}
            <span className="rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs text-muted backdrop-blur">
              {snapshot.totalFollowers.toLocaleString()} followers · {snapshot.clusters.length} niches
            </span>
          </div>

          {projectId && (
            <CampaignPanel
              projectId={projectId}
              audience={snapshot}
              xHandle={xHandle ?? null}
              displayName={displayName ?? null}
              seedCopy={seedCopy ?? null}
              selectedId={selected}
              onSelect={setSelected}
              onStageChange={setStage}
              onSimRunning={setSimRunning}
            />
          )}

          {profileMember && (
            <MemberProfileCard
              member={profileMember}
              cluster={snapshot.clusters.find((c) => c.id === profileMember.clusterId) ?? null}
              onClose={() => setProfileMember(null)}
            />
          )}

          {vizOnly &&
            (selectedCluster ? (
              <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-end gap-3 max-md:w-[calc(100%-2rem)]">
                <button
                  onClick={() => setSelected(null)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface/80 px-3.5 py-2 text-xs font-medium text-muted backdrop-blur transition-colors hover:border-line-strong hover:text-fg"
                >
                  Overview
                </button>
                <div className="max-w-lg rounded-2xl border border-line bg-surface/85 px-4 py-3 text-xs backdrop-blur">
                  <p className="font-medium text-fg">
                    {selectedCluster.label}
                    <span className="font-normal text-faint"> · {selectedCluster.members.toLocaleString()} followers</span>
                  </p>
                  <p className="mt-0.5 text-muted">{selectedCluster.blurb}</p>
                  {selectedCluster.summary && (
                    <p className="mt-1.5 leading-[1.15rem] text-faint max-md:hidden">{selectedCluster.summary}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-surface/70 px-4 py-2 text-xs text-faint backdrop-blur">
                Click a niche label to zoom · click a follower for their full profile · ⌥&thinsp;drag to orbit
              </p>
            ))}
        </>
      )}
    </div>
  );
}
