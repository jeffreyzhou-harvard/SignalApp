import { NextResponse } from "next/server";
import { getAudienceProvider } from "@/lib/audience/registry";
import { resolveAudienceHandle } from "@/lib/audience/resolve";
import { getImageProvider, getTextProvider } from "@/lib/providers/registry";
import { getStorage } from "@/lib/storage";
import { LAUNCH_COPY_GUIDE } from "@/lib/launch-copy";
import { parseModelJson } from "@/lib/model-json";
import type { CampaignVariant } from "@/lib/simulation/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Tailors the baseline post for one niche: Grok rewrites the copy AND nudges
 * the poster image (a subtle Imagine edit, not a redesign) toward how that
 * niche reads. Video or missing media is carried over unchanged. Returns
 * variant B for the wind tunnel.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ids: string[] =
    Array.isArray(body?.clusterIds) && body.clusterIds.length ? body.clusterIds : body?.clusterId ? [body.clusterId] : [];
  if (!body?.projectId || ids.length === 0 || typeof body.baselineCopy !== "string") {
    return NextResponse.json({ error: "projectId, clusterId(s), and baselineCopy are required." }, { status: 400 });
  }

  const storage = getStorage();
  const project = await storage.getProject(body.projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const settings = await storage.getSettings();
  const audience = await getAudienceProvider().getAudience({
    handle: resolveAudienceHandle(settings),
    projectId: project.id,
  });
  const targets = audience.clusters.filter((c) => ids.includes(c.id));
  if (targets.length === 0) return NextResponse.json({ error: "Unknown audience niche." }, { status: 400 });
  const cluster = targets[0];

  // One niche keeps the sharp single-audience rewrite; several niches hand
  // Grok every cluster's creative brief and ask for the shared hook.
  const nicheDirective =
    targets.length === 1
      ? `Rewrite it for one specific niche of their audience: ${cluster.label} (${cluster.members.toLocaleString()} followers). Niche read: ${cluster.summary || cluster.blurb}`
      : `Rewrite it to land with ALL of these niches of their audience at once — find the hook they share without flattening into generic copy:\n` +
        targets
          .map((c) => `- ${c.label} (${c.members.toLocaleString()} followers): ${c.summary || c.blurb}`)
          .join("\n");

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
    nicheDirective,
    "Keep the product facts, change the voice: lead with the hook this niche responds to.",
    LAUNCH_COPY_GUIDE,
    body.mediaKind === "image" && body.mediaUrl
      ? "Also write ONE subtle image-edit instruction for the existing poster: a small nudge that lands better with this niche (shift emphasis, accent color, tagline framing, or one visual element). Keep the product, layout, and overall composition intact."
      : "",
    'Respond with STRICT JSON only, no prose: {"copy":"...","image_edit":"..."} (omit image_edit if no poster edit was requested).',
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const provider = getTextProvider();
    let full = "";
    for await (const delta of provider.stream({ messages: [{ role: "user", content: prompt }] })) {
      full += delta;
    }
    const parsed = parseModelJson<{ copy?: unknown; image_edit?: unknown }>(full);
    if (!parsed || !parsed.copy || typeof parsed.copy !== "string") {
      throw new Error("The copywriter returned no usable rewrite. Try again.");
    }

    let mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl : null;
    const mediaKind: CampaignVariant["mediaKind"] =
      body.mediaKind === "image" || body.mediaKind === "video" ? body.mediaKind : null;

    // Nudge the poster for this niche; on any failure the original image stands.
    if (mediaKind === "image" && mediaUrl && typeof parsed.image_edit === "string" && parsed.image_edit.trim()) {
      try {
        const name = mediaUrl.split("/").pop();
        const file = name ? await storage.readFile(name) : null;
        if (file) {
          const images = await getImageProvider().generate({
            prompt: parsed.image_edit,
            sourceImages: [`data:${file.mime};base64,${file.bytes.toString("base64")}`],
          });
          if (images[0]) {
            mediaUrl = await storage.saveFile(
              crypto.randomUUID(),
              Buffer.from(images[0].b64, "base64"),
              images[0].mime
            );
          }
        }
      } catch {}
    }

    const variant: CampaignVariant = { id: "B", copy: parsed.copy, mediaUrl, mediaKind };
    return NextResponse.json({ variant, model: provider.defaultModel });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not tailor the post." },
      { status: 502 }
    );
  }
}
