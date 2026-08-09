import { describe, expect, it } from "vitest";
import { MAX_MEDIA_PROMPT_CHARS, mediaPromptError } from "./limits";

describe("mediaPromptError", () => {
  it("passes a normal scene prompt", () => {
    expect(mediaPromptError("Pocket device on a desk, slow push in", "video")).toBeNull();
  });

  it("passes a prompt exactly at the cap", () => {
    expect(mediaPromptError("x".repeat(MAX_MEDIA_PROMPT_CHARS), "video")).toBeNull();
  });

  it("rejects a pasted brief and says what to do instead", () => {
    const msg = mediaPromptError("x".repeat(MAX_MEDIA_PROMPT_CHARS + 1), "video");
    expect(msg).toContain("4,097 characters");
    expect(msg).toContain("single scene");
  });

  it("names the media kind", () => {
    expect(mediaPromptError("x".repeat(9000), "image")).toContain("image prompt");
  });
});
