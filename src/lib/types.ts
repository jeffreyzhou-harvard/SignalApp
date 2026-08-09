/**
 * Core domain types shared across storage, providers, API routes, and UI.
 * Everything external (AI, storage, account linking) hangs off the pluggable
 * interfaces in ./providers, ./storage, and ./accounts — these are the shapes
 * they exchange.
 */

export interface Project {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** URL of the most recent generated image, used as the grid thumbnail. */
  thumbnail: string | null;
  /** Folder this project lives in; null/undefined = unfiled. */
  folderId?: string | null;
  /** Set when the project is in the trash; null/undefined = active. */
  deletedAt?: string | null;
}

export interface ProjectFolder {
  id: string;
  name: string;
  createdAt: string;
}

export type MessageRole = "user" | "assistant";
export type MessageKind = "text" | "image" | "video";

export interface ChatMessage {
  id: string;
  projectId: string;
  role: MessageRole;
  kind: MessageKind;
  /** Text content, or the prompt that produced an image message. */
  content: string;
  /** Attached (user) or generated (assistant) media URLs (images or videos). */
  images: string[];
  /** Provider/model that produced an assistant message. */
  model?: string;
  createdAt: string;
  error?: string;
}

export interface LinkedXAccount {
  handle: string;
  linkedAt: string;
  /** Which account provider produced this link ("x-stub" or "x-oauth"). */
  provider: string;
  /** OAuth-only fields. Tokens live server-side and are stripped from API responses. */
  userId?: string;
  accessToken?: string;
  refreshToken?: string;
  /** Epoch ms when accessToken expires. */
  expiresAt?: number;
  scope?: string;
}

/**
 * A compact snapshot of the winning wind-tunnel result, captured at Ship time
 * so we can compare what the simulation predicted against what actually happened
 * on X. Persisted alongside the DeployedPost.
 */
export interface DeployPrediction {
  winner: "A" | "B";
  /** Engagement-rate lift of the winner over the loser, in percent. */
  predictedLiftPct: number;
  confidencePct: number;
  driver: string;
  /** The winner's simulated engagement rate (percent) — compared to the live one. */
  predictedEngagementRate: number;
  /** Simulation provider that produced the run (labels simulated runs honestly). */
  provider: string;
  agentCount: number;
  capturedAt: string;
}

/** An X post published from Signal (via the Ship button or the copilot). */
export interface DeployedPost {
  /** X tweet id. */
  id: string;
  text: string;
  url: string | null;
  handle: string;
  projectId?: string | null;
  createdAt: string;
  /** Present when the post was shipped from a wind-tunnel verdict. */
  prediction?: DeployPrediction | null;
}

/**
 * Live engagement for a deployed post, fetched from the X API. The first five
 * fields come from public_metrics (any post); the owner-only fields come from
 * non_public_metrics/organic_metrics (author + last 30 days) and are undefined
 * when unavailable (public-only fallback or older post).
 */
export interface PostMetrics {
  likes: number;
  reposts: number;
  replies: number;
  views: number;
  bookmarks: number;
  /** Owner-only (non_public_metrics): clicks on links in the post. */
  linkClicks?: number;
  /** Owner-only (non_public_metrics): clicks through to the author's profile. */
  profileClicks?: number;
  /** Owner-only (non_public_metrics): total engagement count reported by X. */
  engagements?: number;
  /** Derived: (likes+reposts+replies+bookmarks)/views * 100. */
  engagementRate?: number;
}

/** One point in a deployed post's engagement history, stored per refresh. */
export interface MetricSnapshot {
  deployId: string;
  capturedAt: string;
  metrics: PostMetrics;
}

/** How a single deploy compares to its baselines. */
export interface DeployComparisons {
  /** This post's engagement rate (percent), or null when views are unknown. */
  engagementRate: number | null;
  /** Percent difference vs the rolling average of the other deploys. */
  vsRollingAvgPct: number | null;
  /** Percent difference vs the immediately previous (older) deploy. */
  vsPreviousPct: number | null;
  /** Present only for posts that shipped from a simulation. */
  predicted?: { predictedRate: number; actualRate: number; deltaPct: number };
}

/** A deploy enriched with live metrics, trend history, and comparisons. */
export type DeployAnalytics = DeployedPost & {
  metrics: PostMetrics | null;
  trend: MetricSnapshot[];
  comparisons: DeployComparisons;
};

/** Top-of-page rollup across all deploys. */
export interface DeploySummary {
  totalImpressions: number;
  avgEngagementRate: number | null;
  bestDeployId: string | null;
  vsPreviousPeriodPct: number | null;
}

/** Shape returned by GET /api/deploys. */
export interface DeploysResponse {
  live: boolean;
  deploys: DeployAnalytics[];
  summary: DeploySummary;
}

export interface UserProfile {
  /** Display name, used in the shell and the copilot's address. */
  name: string | null;
}

export interface CreativeDefaults {
  /** Style preset id from src/lib/styles.ts. */
  style: string;
  resolution: "1k" | "2k";
}

export interface AppSettings {
  xAccount: LinkedXAccount | null;
  profile?: UserProfile;
  defaults?: CreativeDefaults;
  /** Demo override: view this seed handle's audience map instead of the linked account's. Null = auto. */
  audienceHandle?: string | null;
}

/** What the settings API exposes: no tokens, plus how linking works right now. */
export interface PublicSettings {
  xAccount: Pick<LinkedXAccount, "handle" | "linkedAt" | "provider"> | null;
  profile: UserProfile;
  defaults: CreativeDefaults;
  audienceHandle: string | null;
  auth: {
    provider: string;
    /** "local" = type a handle; "redirect" = Sign in with X. */
    mode: "local" | "redirect";
    startUrl: string | null;
  };
}
