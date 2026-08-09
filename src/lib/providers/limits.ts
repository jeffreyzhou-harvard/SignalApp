/** Grok Imagine rejects prompts over 4096 characters with a raw 400. Check
 * before spending the call so the founder gets an actionable message instead
 * of a provider error code. */
export const MAX_MEDIA_PROMPT_CHARS = 4096;

export function mediaPromptError(prompt: string, kind: "image" | "video"): string | null {
  if (prompt.length <= MAX_MEDIA_PROMPT_CHARS) return null;
  const noun = kind === "video" ? "video" : "image";
  return (
    `That ${noun} prompt is ${prompt.length.toLocaleString("en-US")} characters — Grok Imagine ` +
    `caps prompts at ${MAX_MEDIA_PROMPT_CHARS.toLocaleString("en-US")}. Describe the single scene you ` +
    `want to see (subject, motion, camera, lighting, mood) rather than pasting a brief or script.`
  );
}
