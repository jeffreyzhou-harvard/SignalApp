import { MAX_MEDIA_PROMPT_CHARS } from "./limits";

/**
 * House style prepended to every AI-generated image and video prompt so all
 * media reads as polished launch/marketing material regardless of caller.
 */
export const MEDIA_HOUSE_STYLE =
  "Professional product launch marketing visual: polished, premium, brand-quality production. ";

/** Prepend the house style, clamping to the provider prompt cap. */
export function withHouseStyle(prompt: string): string {
  return (MEDIA_HOUSE_STYLE + prompt).slice(0, MAX_MEDIA_PROMPT_CHARS);
}
