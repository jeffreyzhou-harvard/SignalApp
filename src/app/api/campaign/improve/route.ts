import { NextResponse } from "next/server";
import { getAudienceProvider } from "@/lib/audience/registry";
import { getImageProvider, getTextProvider, getVideoProvider } from "@/lib/providers/registry";
import { getStorage } from "@/lib/storage";
import { LAUNCH_COPY_GUIDE } from "@/lib/launch-copy";
import type { CampaignVariant } from "@/lib/simulation/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ImproveRequest {
  projectId: string;
  clusterId: string;
  clusterIds?: string[];
  winner: CampaignVariant;
  loser: CampaignVariant;
  verdict: { winner: "A" | "B"; liftPct: number; confidencePct: number; driver: string };
  engagement: { A: number; B: number };
  replies?: Array<{ text: string; sentiment?: string; variant: "A" | "B" }>;
}

/**
 * The self-improvement agent: reads the wind-tunnel outcome, rewrites the
 * winning copy, and re-renders its media — image winners are edited in place
 * (Grok Imagine edits on the existing poster), video/no-media winners get a
 * fresh render. Returns a new challenger variant plus the agent's rationale,
 * so the panel can loop straight into another A/B round.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ImproveRequest | null;
  if (!body?.projectId || !body?.clusterId || !body?.winner || !body?.verdict) {
    return NextResponse.json({ error: "projectId, clusterId, winner, and verdict are required." }, { status: 400 });
  }

  const storage = getStorage();
  const project = await storage.getProject(body.projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const settings = await storage.getSettings();
  const audience = await getAudienceProvider().getAudience({
    handle: settings.xAccount?.handle,
    projectId: project.id,
  });
  const ids = body.clusterIds?.length ? body.clusterIds : [body.clusterId];
  const targets = audience.clusters.filter((c) => ids.includes(c.id));
  if (targets.length === 0) return NextResponse.json({ error: "Unknown audience niche." }, { status: 400 });
  const cluster = targets[0];
  const nicheRead =
    targets.length === 1
      ? `Target niche: ${cluster.label} (${cluster.members.toLocaleString()} followers). Niche read: ${cluster.summary || cluster.blurb}`
      : `Target niches (the copy must land with all of them):\n` +
        targets
          .map((c) => `- ${c.label} (${c.members.toLocaleString()} followers): ${c.summary || c.blurb}`)
          .join("\n");

  const replyLines = (body.replies ?? [])
    .slice(0, 8)
    .map((r) => `- [variant ${r.variant}${r.sentiment ? `, ${r.sentiment}` : ""}] "${r.text}"`)
    .join("\n");

  const prompt = [
    `You are the Signal optimization agent for the project "${project.title}".`,
    nicheRead,
    `A simulated A/B test just finished. Winner: variant ${body.verdict.winner} with ${body.engagement[body.verdict.winner]}% engagement (loser: ${body.engagement[body.verdict.winner === "A" ? "B" : "A"]}%). Lift: +${body.verdict.liftPct}%, confidence ${body.verdict.confidencePct}%, driven by ${body.verdict.driver}.`,
    `Winning copy:\n"${body.winner.copy}"`,
    `Losing copy:\n"${body.loser?.copy ?? "(none)"}"`,
    replyLines ? `Sample audience replies:\n${replyLines}` : "",
    "Your job: produce the NEXT iteration that beats the winner.",
    "1. Rewrite the copy: keep what drove the win (lean into the driver actions), fix what the replies question. Follow this guide:\n" + LAUNCH_COPY_GUIDE,
    body.winner.mediaKind === "image"
      ? "2. Write ONE image-edit instruction for the existing poster (change composition/emphasis to support the driver, e.g. bigger price badge if replies asked about price). Keep it a single concrete edit direction."
      : "2. Write ONE full media prompt for a fresh render that supports the driver.",
    "3. One-sentence rationale explaining the change, citing the test results.",
    'Respond with STRICT JSON only: {"copy":"...","media_prompt":"...","rationale":"..."}',
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const textProvider = getTextProvider();
    let full = "";
    for await (const delta of textProvider.stream({ messages: [{ role: "user", content: prompt }] })) {
      full += delta;
    }
    const jsonMatch = full.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("The agent returned no usable plan. Try again.");
    const plan = JSON.parse(jsonMatch[0]);
    if (!plan.copy || !plan.media_prompt) throw new Error("The agent returned an incomplete plan. Try again.");

    // Re-render the media per the agent's instruction.
    let mediaUrl: string | null = body.winner.mediaUrl;
    let mediaKind: CampaignVariant["mediaKind"] = body.winner.mediaKind;
    if (body.winner.mediaKind === "video") {
      const video = await getVideoProvider().generate({ prompt: plan.media_prompt });
      mediaUrl = await storage.saveFile(crypto.randomUUID(), Buffer.from(video.b64, "base64"), video.mime);
      mediaKind = "video";
    } else {
      let sourceImages: string[] | undefined;
      if (body.winner.mediaKind === "image" && body.winner.mediaUrl) {
        const name = body.winner.mediaUrl.split("/").pop();
        const file = name ? await storage.readFile(name) : null;
        if (file) sourceImages = [`data:${file.mime};base64,${file.bytes.toString("base64")}`];
      }
      const images = await getImageProvider().generate({
        prompt: plan.media_prompt,
        aspectRatio: sourceImages ? undefined : "auto",
        sourceImages,
      });
      if (images[0]) {
        mediaUrl = await storage.saveFile(crypto.randomUUID(), Buffer.from(images[0].b64, "base64"), images[0].mime);
        mediaKind = "image";
      }
    }

    const variant: CampaignVariant = { id: "B", copy: plan.copy, mediaUrl, mediaKind };
    return NextResponse.json({
      variant,
      rationale: typeof plan.rationale === "string" ? plan.rationale : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The agent run failed." },
      { status: 502 }
    );
  }
}
