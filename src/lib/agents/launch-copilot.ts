import type { ModelMessage } from "ai";
import type { AppSettings, ChatMessage, Project } from "@/lib/types";
import type { AudienceSnapshot } from "@/lib/audience/types";
import { LAUNCH_COPY_GUIDE } from "@/lib/launch-copy";

/**
 * The launch copilot's brain: the grounded system prompt (who it is, the
 * founder's real audience, how to use the MCP tools) and the conversion of
 * stored chat history into Vercel AI SDK model messages (vision preserved).
 *
 * Pure functions only — no I/O. The route wires in the MCP tools and the model.
 */

export interface LaunchContext {
  project: Project;
  settings: AppSettings;
  snapshot: AudienceSnapshot;
  /** Whether audience MCP tools are attached this turn (drives the tool guidance). */
  hasMcp: boolean;
}

/** The founder-facing audience brief injected into the prompt, from real data. */
function audienceBrief(snapshot: AudienceSnapshot): string {
  if (!snapshot.clusters.length) {
    return "The founder's audience has not been clustered yet; use the audience tools to explore it if available.";
  }
  const catalog = snapshot.clusters
    .map(
      (c) =>
        `- id "${c.id}": ${c.label} — ${c.members.toLocaleString("en-US")} followers. ${c.blurb}`.trim(),
    )
    .join("\n");
  const kind = snapshot.synthetic ? "a representative sample of the founder's audience" : "the founder's real X followers";
  return [
    `The founder's ${snapshot.totalFollowers.toLocaleString("en-US")} followers (${kind}) cluster into these niches:`,
    catalog,
  ].join("\n");
}

/** Tool guidance, scoped to the founder's seed account so the agent can't wander audiences. */
function toolGuidance(snapshot: LaunchContext["snapshot"]): string {
  const seed = snapshot.seedAccountId;
  const lines = [
    "You have live tools over the founder's ingested audience (an MCP server):",
    "list_clusters, get_cluster_members, search (semantic people search), top_interests,",
    "audience_overview, whose_tribe, get_persona, list_audiences.",
    "Use them to ground every audience claim in real data — before you recommend a niche or",
    "tailor copy for one, pull its members/top interests and cite what you find.",
    "Never invent follower counts, interests, or engagement; only state what a tool returned.",
  ];
  if (seed) {
    lines.push(
      `IMPORTANT: this founder's audience is seed_account_id="${seed}". Pass that exact`,
      "seed_account_id to every audience tool that accepts one. Do not query other audiences.",
    );
  } else {
    lines.push(
      "No seed_account_id is known for this founder yet. Call list_audiences first, pick the",
      "audience that matches the founder, and reuse its seed_account_id for the other tools.",
    );
  }
  return lines.join(" ");
}

/**
 * Build the system prompt for a launch-copilot turn: role, founder + project,
 * the real audience brief, MCP tool guidance, and the launch-copy playbook.
 */
export function buildLaunchSystemPrompt(ctx: LaunchContext): string {
  const { project, settings, snapshot, hasMcp } = ctx;
  const founder = settings.profile?.name ? `The founder's name is ${settings.profile.name}.` : "";
  const linked = settings.xAccount
    ? `The founder's linked X account is @${settings.xAccount.handle}; this campaign targets that account's audience.`
    : "No X account is linked yet; if audience data would help, suggest linking one in Settings.";

  return [
    "You are the Signal launch copilot: a launch strategist for products announced on X.",
    "Your job is to help the founder ship a great product launch: sharpen positioning, pick which",
    "audience niches to target, draft real X post copy, and shape poster concepts.",
    founder,
    `You are working inside the project "${project.title}".`,
    linked,
    "",
    audienceBrief(snapshot),
    "",
    hasMcp ? toolGuidance(snapshot) : "Audience tools are unavailable this turn; reason from the niches listed above and say when you would want deeper data.",
    "",
    "When the founder wants a visual, tell them to use Imagine mode (the wand in the composer),",
    "or refine the poster prompt for them; you cannot render images yourself in this chat.",
    "Be concrete and concise. Draft real copy, not descriptions of copy. Ask one question at a time.",
    "Never use em dashes.",
    `When you draft an actual launch post, follow this guide. ${LAUNCH_COPY_GUIDE}`,
  ]
    .filter((l) => l !== undefined && l !== null)
    .join("\n");
}

/**
 * Build the system prompt for the ephemeral "ask your audience" chat on the
 * Audience Map: same real-audience grounding and MCP tool guidance as the
 * launch copilot, but with no project attached. Optionally scoped to the niche
 * the founder is currently looking at on the map.
 */
export function buildAudienceChatSystemPrompt({
  settings,
  snapshot,
  hasMcp,
  focusCluster,
}: {
  settings: AppSettings;
  snapshot: AudienceSnapshot;
  hasMcp: boolean;
  focusCluster?: { id: string; label: string } | null;
}): string {
  const linked = settings.xAccount
    ? `The founder's linked X account is @${settings.xAccount.handle}; this is that account's audience.`
    : "No X account is linked yet; if audience data would help, suggest linking one in Settings.";

  const focus = focusCluster
    ? `The founder is currently looking at the "${focusCluster.label}" niche on the map (cluster id "${focusCluster.id}"). Focus your answer on that niche unless they ask about the whole audience.`
    : undefined;

  return [
    "You are the Signal audience copilot. Help the founder understand this X audience and plan a",
    "product launch: which niches to target, what they care about, who's in them, and how to speak to them.",
    linked,
    "",
    audienceBrief(snapshot),
    "",
    hasMcp ? toolGuidance(snapshot) : "Audience tools are unavailable this turn; reason from the niches listed above and say when you would want deeper data.",
    focus,
    "",
    "Be concrete and concise. Draft real copy, not descriptions of copy. Ask one question at a time.",
    "Never use em dashes. To render posters, tell the founder to open a project and use Imagine mode;",
    "you cannot generate images in this view.",
    `When you draft an actual launch post, follow this guide. ${LAUNCH_COPY_GUIDE}`,
  ]
    .filter((l) => l !== undefined && l !== null)
    .join("\n");
}

/**
 * Convert stored chat history into AI SDK model messages, inlining attached
 * images as vision parts (same behavior as the previous copilot, new format).
 */
export async function toModelMessages(
  history: ChatMessage[],
  resolveImage: (url: string) => Promise<string | null>,
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = [];
  for (const m of history) {
    if (m.role === "assistant") {
      messages.push({
        role: "assistant",
        content:
          m.kind === "image"
            ? `[Generated poster for prompt: "${m.content}"]`
            : m.kind === "video"
              ? `[Generated video for prompt: "${m.content}"]`
              : m.content,
      });
      continue;
    }
    if (m.images.length === 0) {
      messages.push({ role: "user", content: m.content });
      continue;
    }
    const parts: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [];
    for (const url of m.images) {
      const dataUrl = await resolveImage(url);
      if (dataUrl) parts.push({ type: "image", image: dataUrl });
    }
    parts.push({ type: "text", text: m.content });
    messages.push({ role: "user", content: parts });
  }
  return messages;
}
