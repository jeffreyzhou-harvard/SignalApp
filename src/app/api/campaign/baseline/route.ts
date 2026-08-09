import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { getTextProvider } from "@/lib/providers/registry";
import { buildLaunchPostPrompt } from "@/lib/launch-copy";
import { parseModelJson } from "@/lib/model-json";
import type { ProviderMessage } from "@/lib/providers/types";
import type { CampaignVariant } from "@/lib/simulation/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The starting post for the campaign flow. Grok drafts a snappy launch post
 * from the founder's own material: their chat brief, any product photos they
 * uploaded (passed as vision input), and the latest render's prompt. Media
 * comes from the newest generation in the project. Falls back to the raw
 * brief if drafting fails, so the panel never blocks.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.projectId) {
    return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  }

  const storage = getStorage();
  const project = await storage.getProject(body.projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const messages = await storage.listMessages(project.id);
  const media = messages.filter((m) => (m.kind === "image" || m.kind === "video") && m.images.length > 0);
  const newest = media[media.length - 1] ?? null;

  const brief = messages.find((m) => m.role === "user" && m.kind === "text");
  const rawBrief = brief?.content.replace(/^\/imagine\s+/, "") ?? project.title;
  const fallbackCopy = rawBrief.length > 260 ? `${rawBrief.slice(0, 257)}…` : rawBrief;

  // The founder's uploaded product shots, as vision input for the draft.
  const uploadedUrls = messages
    .filter((m) => m.role === "user" && m.images.length > 0)
    .flatMap((m) => m.images)
    .slice(0, 3);
  const imageParts: Array<{ type: "image_url"; image_url: { url: string } }> = [];
  for (const url of uploadedUrls) {
    const name = url.split("/").pop();
    const file = name ? await storage.readFile(name) : null;
    if (file && file.mime.startsWith("image/")) {
      imageParts.push({
        type: "image_url",
        image_url: { url: `data:${file.mime};base64,${file.bytes.toString("base64")}` },
      });
    }
  }

  const context = messages
    .filter((m) => m.kind === "text")
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Founder" : "Copilot"}: ${m.content.slice(0, 300)}`)
    .join("\n");

  const prompt = buildLaunchPostPrompt({
    projectTitle: project.title,
    brief: rawBrief,
    mediaNote: newest?.content ?? null,
    context,
  });

  let copy = fallbackCopy;
  try {
    const provider = getTextProvider();
    const message: ProviderMessage =
      imageParts.length > 0
        ? { role: "user", content: [...imageParts, { type: "text", text: prompt }] }
        : { role: "user", content: prompt };
    let full = "";
    for await (const delta of provider.stream({ messages: [message] })) {
      full += delta;
    }
    const parsed = parseModelJson<{ copy?: unknown }>(full);
    if (parsed && typeof parsed.copy === "string" && parsed.copy.trim()) copy = parsed.copy.trim();
  } catch {
    // Drafting is best-effort; the raw brief keeps the flow moving.
  }

  const variant: CampaignVariant = {
    id: "A",
    copy,
    mediaUrl: newest?.images[0] ?? null,
    mediaKind: newest ? (newest.kind as "image" | "video") : null,
  };
  return NextResponse.json({ variant, drafted: copy !== fallbackCopy });
}
