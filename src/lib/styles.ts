/**
 * Style presets for Grok Imagine (images and video). Shared by the composer UI
 * and the chat route: the client sends a preset id, the server appends the
 * preset's prompt fragment to the generation call. The user's own prompt is
 * stored untouched. Add presets here and both sides pick them up.
 */

export interface StylePreset {
  id: string;
  label: string;
  hint: string;
  /** Appended to the generation prompt. Empty = no styling. */
  prompt: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: "none", label: "Natural", hint: "No styling, prompt as written", prompt: "" },
  {
    id: "minimal",
    label: "Minimal",
    hint: "Clean, lots of negative space",
    prompt: "minimalist composition, generous negative space, restrained palette, crisp modern typography",
  },
  {
    id: "cartoon",
    label: "Cartoon",
    hint: "Playful flat illustration",
    prompt: "playful cartoon illustration, bold outlines, flat vibrant colors, friendly character energy",
  },
  {
    id: "photoreal",
    label: "Photoreal",
    hint: "Editorial product photography",
    prompt: "photorealistic editorial product photography, natural light, shallow depth of field",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    hint: "Dramatic film-still key art",
    prompt: "cinematic key art, dramatic lighting, high contrast, shot like a film still",
  },
  {
    id: "retro",
    label: "Retro",
    hint: "Vintage print poster",
    prompt: "vintage print poster, halftone texture, 1970s color palette, subtle paper grain",
  },
  {
    id: "neon",
    label: "Neon",
    hint: "Dark ground, electric glow",
    prompt: "dark background, electric neon accents, glowing edges, sleek futuristic mood",
  },
];

export function getStylePreset(id: string | undefined): StylePreset | null {
  if (!id || id === "none") return null;
  return STYLE_PRESETS.find((s) => s.id === id) ?? null;
}

/** Appends the preset fragment to a generation prompt. */
export function applyStyle(prompt: string, styleId: string | undefined): string {
  const preset = getStylePreset(styleId);
  return preset ? `${prompt}, ${preset.prompt}` : prompt;
}
