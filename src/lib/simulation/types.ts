import type { AudienceSnapshot } from "../audience/types";

/**
 * Pluggable wind-tunnel simulation. The mock provider replays a seeded,
 * deterministic event stream; a real agent harness (persona agents grounded in
 * each niche's posts, AgentTorch-style) implements this same interface and
 * registers under a new id — the panel UI never changes.
 */

export interface CampaignVariant {
  id: "A" | "B";
  copy: string;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
}

export type SimAction = "view" | "like" | "repost" | "reply" | "bookmark";
export type SimSentiment = "pos" | "neu" | "neg";

export interface SimEvent {
  /** AudienceMember.id — the client resolves avatar/handle from its snapshot. */
  memberId: number;
  variant: "A" | "B";
  action: SimAction;
  reply?: string;
  sentiment?: SimSentiment;
}

export interface SimTally {
  views: number;
  likes: number;
  reposts: number;
  replies: number;
  bookmarks: number;
}

export interface SimVerdict {
  winner: "A" | "B";
  /** Engagement-rate lift of the winner over the loser, in percent. */
  liftPct: number;
  confidencePct: number;
  driver: string;
}

export interface SimResult {
  events: SimEvent[];
  final: { A: SimTally; B: SimTally };
  engagement: { A: number; B: number };
  verdict: SimVerdict;
  /** Provider that produced the run — the UI labels simulated runs honestly. */
  provider: string;
  agentCount: number;
}

export interface SimulationInput {
  projectId: string;
  clusterId: string;
  variants: CampaignVariant[];
  audience: AudienceSnapshot;
  /** Who reacts: just the targeted niche, or the whole follower demographic. */
  scope?: "niche" | "all";
}

export interface SimulationProvider {
  id: string;
  label: string;
  run(input: SimulationInput): Promise<SimResult>;
}

export const emptyTally = (): SimTally => ({ views: 0, likes: 0, reposts: 0, replies: 0, bookmarks: 0 });

export function applyEvent(t: SimTally, e: SimEvent): SimTally {
  const next = { ...t, views: t.views + 1 };
  if (e.action === "like") next.likes++;
  if (e.action === "repost") next.reposts++;
  if (e.action === "reply") next.replies++;
  if (e.action === "bookmark") next.bookmarks++;
  return next;
}

export function engagementRate(t: SimTally): number {
  if (t.views === 0) return 0;
  return ((t.likes + t.reposts + t.replies + t.bookmarks) / t.views) * 100;
}
