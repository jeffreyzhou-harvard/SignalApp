// Single source of truth for the realtime session: instructions + every tool.
// Adding a tool = one entry here + one handler in tools.ts. Nothing else.
import type { AudienceCluster } from "@/lib/audience/types";

export const CLIENT_TOOL_NAMES = [
  "focus_cluster",
  "generate_image",
  "edit_image",
  "generate_video",
  "post_to_x",
] as const;
export type ClientToolName = (typeof CLIENT_TOOL_NAMES)[number];

type ClusterLite = Pick<AudienceCluster, "id" | "label" | "members" | "blurb">;

export interface SessionOptions {
  clusters: ClusterLite[];
  totalFollowers: number;
  mcpUrl?: string;
  mcpToken?: string;
  voice?: string;
}

function instructions(clusters: ClusterLite[], totalFollowers: number): string {
  const catalog = clusters
    .map(
      (c) =>
        `- id "${c.id}": ${c.label} — ${c.members.toLocaleString("en-US")} followers. ${c.blurb}`,
    )
    .join("\n");
  return [
    "You are the AgentSim campaign copilot: a launch strategist for posting on X.",
    "You speak briefly and confidently, like a sharp creative director. One question at a time.",
    `The founder's ${totalFollowers.toLocaleString("en-US")} followers are clustered into niches:`,
    catalog || "(niche catalog unavailable — ask the audience MCP tools when needed)",
    "",
    "Core loop: (1) help pick a target niche — call focus_cluster the moment one is chosen",
    "so the audience map zooms; (2) interview the founder about the product; (3) draft a",
    "post and call generate_image for its poster (use edit_image to iterate, never start",
    "over unless asked); (4) when the founder approves, call post_to_x — first WITHOUT",
    "confirm to show the draft, then with confirm=true only after an explicit yes.",
    "Use x_search for what's live on X right now (competitor launches, hook styles).",
    "Use the audience MCP tools (when available) for deep niche stats and member lookups.",
    "Never invent engagement numbers; only cite what tools return.",
  ].join("\n");
}

export function buildSessionPayload(opts: SessionOptions) {
  const tools: unknown[] = [
    { type: "x_search" },
    {
      type: "function",
      name: "focus_cluster",
      description:
        "Zoom/highlight one audience niche in the 3D map. Call as soon as a target niche is chosen.",
      parameters: {
        type: "object",
        properties: {
          cluster_id: { type: "string", description: "Niche id from the catalog, e.g. 'students'" },
        },
        required: ["cluster_id"],
      },
    },
    {
      type: "function",
      name: "generate_image",
      description: "Generate a launch poster/image with Grok Imagine. Returns a URL the UI also renders.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Full visual description incl. style, mood, text lockups" },
          aspect_ratio: {
            type: "string",
            enum: ["1:1", "16:9", "3:2", "2:3"],
            description: "2:3 for posters",
          },
        },
        required: ["prompt"],
      },
    },
    {
      type: "function",
      name: "edit_image",
      description: "Edit the most recent (or a given) generated image with Grok Imagine.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "The change to make, e.g. 'warmer palette, add $99 badge'" },
          image_url: { type: "string", description: "Image to edit; omit to edit the latest generation" },
        },
        required: ["prompt"],
      },
    },
    {
      type: "function",
      name: "generate_video",
      description: "Animate an image (or a text prompt) into a short launch video with Grok Imagine.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          image_url: { type: "string", description: "Optional still to animate" },
        },
        required: ["prompt"],
      },
    },
    {
      type: "function",
      name: "post_to_x",
      description:
        "Draft (and, after explicit confirmation, publish) a post from the founder's linked X account. Without confirm=true this only returns a preview. Publishing is text-only for now; generated media stays visible in the app.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Post copy, max 280 characters" },
          media_url: { type: "string", description: "Poster/video URL to show in the draft preview" },
          confirm: { type: "boolean", description: "true ONLY after the founder explicitly says to post" },
        },
        required: ["text"],
      },
    },
  ];

  if (opts.mcpUrl) {
    tools.push({
      type: "mcp",
      server_url: opts.mcpUrl,
      server_label: "audience-vectors",
      ...(opts.mcpToken ? { authorization: `Bearer ${opts.mcpToken}` } : {}),
    });
  }

  return {
    type: "session.update" as const,
    session: {
      voice: opts.voice ?? "eve",
      instructions: instructions(opts.clusters, opts.totalFollowers),
      turn_detection: { type: "server_vad" as const },
      tools,
      audio: {
        input: { format: { type: "audio/pcm", rate: 24000 } },
        output: { format: { type: "audio/pcm", rate: 24000 } },
      },
    },
  };
}
