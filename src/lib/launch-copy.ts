/**
 * The launch-copy skill: one style guide for every surface that drafts X launch
 * posts (campaign baseline, niche tailoring, the improvement agent, and the
 * chat copilot). Distilled from high-performing founder launches on X
 * (Aidan/Sable's "Introducing…" structure, brand promos like Snickers, and
 * launch-post playbooks): announcement hook, stanza rhythm, earned proof,
 * one CTA. Edit here and every drafting surface follows.
 */

export const LAUNCH_COPY_GUIDE = [
  "Launch-post style guide (follow strictly):",
  "- Open with a direct announcement or hook in one short line: \"Introducing {name}, {what it is in plain words}\" or a bold product-first claim. No throat-clearing.",
  "- Structure as 1-3 short stanzas separated by blank lines. Each stanza is one beat: (1) what it is / the hook, (2) the problem it kills or the sharpest differentiator, (3) proof and a call to action.",
  "- Proof means numbers, customers, backers, or dates the founder actually supplied. Never invent traction, funding, customers, or statistics.",
  "- One call to action at most: early access, a date (\"Launching Sept 4\"), a deadline (\"2 days left\"), or \"here's how it works:\" as a teaser.",
  "- Snappy over complete: sentence fragments are fine, every word earns its place, aim under 280 characters.",
  "- NO hashtags and NO @mentions unless the founder's own material explicitly includes them.",
  "- Never use em dashes. At most one emoji, and only when the brand voice is playful.",
  "- If the post ships with an image or video, the copy must not describe the visual; it complements it.",
].join("\n");

export interface LaunchPostInput {
  projectTitle: string;
  /** The founder's own words: brief, instructions, product description. */
  brief: string;
  /** What the attached/generated media shows (e.g. the Imagine prompt). */
  mediaNote?: string | null;
  /** Extra conversation context, already trimmed. */
  context?: string | null;
}

/** Prompt for drafting the initial launch post from the founder's material. */
export function buildLaunchPostPrompt(input: LaunchPostInput): string {
  return [
    `You are a launch copywriter for X. Project: "${input.projectTitle}".`,
    `The founder's instructions and material:\n"${input.brief}"`,
    input.mediaNote ? `The post ships with generated media showing: "${input.mediaNote}".` : "The post has no media yet.",
    input.context ? `Additional conversation context:\n${input.context}` : "",
    LAUNCH_COPY_GUIDE,
    "Write THE launch post for this product from the founder's material (and the attached product images, if any).",
    'Respond with STRICT JSON only, no prose: {"copy":"..."}',
  ]
    .filter(Boolean)
    .join("\n\n");
}
