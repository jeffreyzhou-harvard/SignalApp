import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import type { CampaignVariant } from "@/lib/simulation/types";

export const runtime = "nodejs";

/**
 * The untailored starting post — no AI involved. Copy comes from the founder's
 * own brief (first chat message), media from the latest render in the project.
 * This is variant A in the wind tunnel; /api/campaign/tailor produces B.
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
  const rawCopy = brief?.content.replace(/^\/imagine\s+/, "") ?? project.title;
  const copy = rawCopy.length > 260 ? `${rawCopy.slice(0, 257)}…` : rawCopy;

  const variant: CampaignVariant = {
    id: "A",
    copy,
    mediaUrl: newest?.images[0] ?? null,
    mediaKind: newest ? (newest.kind as "image" | "video") : null,
  };
  return NextResponse.json({ variant });
}
