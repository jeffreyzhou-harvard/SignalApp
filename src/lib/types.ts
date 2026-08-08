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
  /** Which account provider produced this link (e.g. "x-stub", later "x-oauth"). */
  provider: string;
}

export interface AppSettings {
  xAccount: LinkedXAccount | null;
}
