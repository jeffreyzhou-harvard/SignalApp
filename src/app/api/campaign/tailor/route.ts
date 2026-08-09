import { NextResponse } from "next/server";
import { getAudienceProvider } from "@/lib/audience/registry";
import { getTextProvider } from "@/lib/providers/registry";
import { getStorage } from "@/lib/storage";
import { LAUNCH_COPY_GUIDE } from "@/lib/launch-copy";
import type { CampaignVariant } from "@/lib/simulation/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Rewrites the baseline post for one niche with the text provider. Media is
 * carried over unchanged; only the copy is tailored. Returns variant B for
 * the wind tunnel.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.projectId || !body?.clusterId || typeof body.baselineCopy !== "string") {
    return NextResponse.json({ error: "projectId, clusterId, and baselineCopy are required." }, { status: 400 });
  }

  const storage = getStorage();
  const project = await storage.getProject(body.projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const settings = await storage.getSettings();
  const audience = await getAudienceProvider().getAudience({
    handle: settings.xAccount?.handle,
    projectId: project.id,
  });
  const cluster = audience.clusters.find((c) => c.id === body.clusterId);
  if (!cluster) return NextResponse.json({ error: "Unknown audience niche." }, { status: 400 });

  const messages = await storage.listMessages(project.id);
  const context = messages
    .filter((m) => m.kind === "text")
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Founder" : "Copilot"}: ${m.content.slice(0, 400)}`)
    .join("\n");

  const prompt = [
    `You are a launch copywriter for X. Project: "${project.title}".`,
    context ? `Conversation so far:\n${context}` : "",
    `The founder's current draft post reads:\n"${body.baselineCopy}"`,
    `Rewrite it for one specific niche of their audience: ${cluster.label} (${cluster.members.toLocaleString()} followers). Niche read: ${cluster.blurb}`,
    "Keep the product facts, change the voice: lead with the hook this niche responds to.",
    LAUNCH_COPY_GUIDE,
    'Respond with STRICT JSON only, no prose: {"copy":"..."}',
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const provider = getTextProvider();
    let full = "";
    for await (const delta of provider.stream({ messages: [{ role: "user", content: prompt }] })) {
      full += delta;
    }
    const jsonMatch = full.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("The copywriter returned no usable rewrite. Try again.");
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.copy || typeof parsed.copy !== "string") {
      throw new Error("The copywriter returned no usable rewrite. Try again.");
    }

    const variant: CampaignVariant = {
      id: "B",
      copy: parsed.copy,
      mediaUrl: typeof body.mediaUrl === "string" ? body.mediaUrl : null,
      mediaKind: body.mediaKind === "image" || body.mediaKind === "video" ? body.mediaKind : null,
    };
    return NextResponse.json({ variant, model: provider.defaultModel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not tailor the post." },
      { status: 502 }
    );
  }
}
