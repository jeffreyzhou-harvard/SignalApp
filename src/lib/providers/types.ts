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
  aspectRatio?: string;
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
