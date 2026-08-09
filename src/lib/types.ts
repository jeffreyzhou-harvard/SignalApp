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

/** An X post published from AgentSim (via the Ship button or the copilot). */
export interface DeployedPost {
  /** X tweet id. */
  id: string;
  text: string;
  url: string | null;
  handle: string;
  projectId?: string | null;
  createdAt: string;
}

/** Live engagement for a deployed post, fetched from the X API. */
export interface PostMetrics {
  likes: number;
  reposts: number;
  replies: number;
  views: number;
  bookmarks: number;
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
}

/** What the settings API exposes: no tokens, plus how linking works right now. */
export interface PublicSettings {
  xAccount: Pick<LinkedXAccount, "handle" | "linkedAt" | "provider"> | null;
  profile: UserProfile;
  defaults: CreativeDefaults;
  auth: {
    provider: string;
    /** "local" = type a handle; "redirect" = Sign in with X. */
    mode: "local" | "redirect";
    startUrl: string | null;
  };
}
