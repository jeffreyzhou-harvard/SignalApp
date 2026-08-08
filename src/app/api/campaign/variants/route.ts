import { NextResponse } from "next/server";
import { getAudienceProvider } from "@/lib/audience/registry";
import { getTextProvider } from "@/lib/providers/registry";
import { getStorage } from "@/lib/storage";
import type { CampaignVariant } from "@/lib/simulation/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Drafts two tribe-tailored copy variants (A/B) with the text provider and
 * pairs them with the project's generated media (older render → A, newest → B,
 * mirroring the demo's iteration-2 vs final matchup).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.projectId || !body?.clusterId) {
    return NextResponse.json({ error: "projectId and clusterId are required." }, { status: 400 });
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
  if (!cluster) return NextResponse.json({ error: "Unknown audience tribe." }, { status: 400 });

  const messages = await storage.listMessages(project.id);
  const media = messages.filter((m) => (m.kind === "image" || m.kind === "video") && m.images.length > 0);
  const newest = media[media.length - 1] ?? null;
  const older = media.length > 1 ? media[media.length - 2] : newest;

  const context = messages
    .filter((m) => m.kind === "text")
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Founder" : "Copilot"}: ${m.content.slice(0, 400)}`)
    .join("\n");

  const prompt = [
    `You are a launch copywriter for X. Project: "${project.title}".`,
    context ? `Conversation so far:\n${context}` : "No conversation context yet; write from the project title.",
    newest ? `The post will carry a generated ${newest.kind} (prompt was: "${newest.content}").` : "The post has no media yet.",
    `Target tribe: ${cluster.label} (${cluster.members.toLocaleString()} followers). Tribe read: ${cluster.blurb}`,
    "Write TWO distinct draft posts for this tribe. Variant A: solid, product-forward. Variant B: sharper hook, more tribe-native voice, clear call to action.",
    "Each under 260 characters. No hashtags unless they earn it. Never use em dashes.",
    'Respond with STRICT JSON only, no prose: {"variants":[{"copy":"..."},{"copy":"..."}]}',
  ].join("\n\n");

  try {
    const provider = getTextProvider();
    let full = "";
    for await (const delta of provider.stream({ messages: [{ role: "user", content: prompt }] })) {
      full += delta;
    }
    const jsonMatch = full.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("The copywriter returned no usable draft. Try again.");
    const parsed = JSON.parse(jsonMatch[0]);
    const copies: string[] = (parsed.variants ?? []).map((v: { copy?: string }) => v.copy).filter(Boolean);
    if (copies.length < 2) throw new Error("The copywriter returned fewer than two variants. Try again.");

    const variants: CampaignVariant[] = [
      {
        id: "A",
        copy: copies[0],
        mediaUrl: older?.images[0] ?? null,
        mediaKind: older ? (older.kind as "image" | "video") : null,
      },
      {
        id: "B",
        copy: copies[1],
        mediaUrl: newest?.images[0] ?? null,
        mediaKind: newest ? (newest.kind as "image" | "video") : null,
      },
    ];
    return NextResponse.json({ variants, model: provider.defaultModel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not draft variants." },
      { status: 502 }
    );
  }
}
