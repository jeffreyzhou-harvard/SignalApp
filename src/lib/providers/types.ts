/**
 * Pluggable AI provider interfaces.
 *
 * To add a new backend (OpenAI, Anthropic, a local model…):
 *   1. Implement TextProvider and/or ImageProvider.
 *   2. Register it in ./registry.ts.
 *   3. Select it with AI_TEXT_PROVIDER / AI_IMAGE_PROVIDER env vars.
 * No UI or route code needs to change.
 */

export interface ProviderMessagePart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string | ProviderMessagePart[];
}

export interface TextStreamOptions {
  messages: ProviderMessage[];
  model?: string;
  signal?: AbortSignal;
}

export interface TextProvider {
  id: string;
  label: string;
  defaultModel: string;
  /** Yields plain-text deltas as they arrive. */
  stream(opts: TextStreamOptions): AsyncIterable<string>;
}

export interface ImageGenOptions {
  prompt: string;
  model?: string;
  n?: number;
  /** e.g. "1:1", "16:9", "2:3", "auto" — see the provider's docs for the full set. */
  aspectRatio?: string;
  resolution?: "1k" | "2k";
  /** Source images (public URLs or data URIs). When present, providers edit/ground on them. */
  sourceImages?: string[];
  signal?: AbortSignal;
}

export interface GeneratedImage {
  /** Base64-encoded image bytes (no data: prefix). */
  b64: string;
  mime: string;
}

export interface ImageProvider {
  id: string;
  label: string;
  defaultModel: string;
  generate(opts: ImageGenOptions): Promise<GeneratedImage[]>;
}

export interface VideoGenOptions {
  prompt: string;
  model?: string;
  /** Seconds, 1–15. */
  duration?: number;
  aspectRatio?: string;
  resolution?: "480p" | "720p" | "1080p";
  /** Source image (public URL or data URI) used as the starting frame. */
  sourceImage?: string;
  signal?: AbortSignal;
}

export interface GeneratedVideo {
  /** Base64-encoded video bytes (no data: prefix). */
  b64: string;
  mime: string;
  duration?: number;
}

/** Async media generation (video is poll-based on most backends). */
export interface VideoProvider {
  id: string;
  label: string;
  defaultModel: string;
  generate(opts: VideoGenOptions): Promise<GeneratedVideo>;
}
