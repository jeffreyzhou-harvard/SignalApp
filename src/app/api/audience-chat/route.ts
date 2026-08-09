import { NextResponse } from "next/server";
import { streamText, stepCountIs } from "ai";
import { xai } from "@ai-sdk/xai";
import { getStorage } from "@/lib/storage";
import { getAudienceProvider } from "@/lib/audience/registry";
import { resolveAudienceHandle } from "@/lib/audience/resolve";
import { connectAudienceMcp } from "@/lib/mcp/audience-mcp";
import { buildAudienceChatSystemPrompt } from "@/lib/agents/launch-copilot";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The ephemeral "ask your audience" chat on the Audience Map: a project-less
 * sibling of /api/chat. Same Grok + audience-MCP grounding, but no project, no
 * vision, and no persistence — the transcript lives only in the client panel.
 */

interface AudienceChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** The niche the founder is focused on in the map, if any. */
  clusterId?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as AudienceChatRequest | null;
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages is required." }, { status: 400 });
  }

  const settings = await getStorage().getSettings();

  // Ground the copilot in the founder's real audience (same snapshot the galaxy
  // renders) and connect the audience MCP so it can pull niche/member/interest
  // data live. No projectId — this is the standalone audience surface.
  const snapshot = await getAudienceProvider().getAudience({ handle: resolveAudienceHandle(settings) });
  const mcp = await connectAudienceMcp();

  const focusCluster = body.clusterId
    ? snapshot.clusters.find((c) => c.id === body.clusterId) ?? null
    : null;

  const system = buildAudienceChatSystemPrompt({
    settings,
    snapshot,
    hasMcp: !!mcp,
    focusCluster: focusCluster ? { id: focusCluster.id, label: focusCluster.label } : null,
  });

  const model = process.env.XAI_TEXT_MODEL ?? "grok-4.5";

  try {
    const result = streamText({
      model: xai(model),
      system,
      // Plain-text roles straight through: no vision, no stored history to hydrate.
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      // Audience MCP tools (undefined if the MCP was unreachable → plain chat).
      tools: mcp?.tools,
      // The Vercel AI SDK tool loop: let Grok call audience tools, then answer.
      stopWhen: stepCountIs(8),
      abortSignal: req.signal,
      onFinish: async () => {
        await mcp?.close();
      },
      onError: async () => {
        await mcp?.close();
      },
    });

    // Plain text stream keeps the ChatRoom reader contract (used by the panel).
    return result.toTextStreamResponse();
  } catch (err) {
    await mcp?.close();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat request failed." },
      { status: 502 }
    );
  }
}
