import { NextResponse } from "next/server";
import { getImageProvider, getVideoProvider } from "@/lib/providers/registry";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Tool-shaped wrapper over the pluggable providers, for the voice harness.
 * {kind: "image"|"edit"|"video", prompt, imageUrl?, aspectRatio?} → {kind, url}.
 * Providers return b64 bytes; we persist via storage and hand back a URL —
 * same pattern as /api/chat.
 */
export async function POST(req: Request) {
  const { kind, prompt, imageUrl, aspectRatio } = await req.json().catch(() => ({}));
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const storage = getStorage();

  // Providers need public URLs or data URIs; our /api/files/<name> URLs are
  // local-only, so read those back as data URIs (mirrors /api/chat).
  async function resolveSource(url: string | undefined): Promise<string | undefined> {
    if (!url) return undefined;
    const m = /\/api\/files\/([^/?#]+)/.exec(url);
    if (!m) return url;
    const file = await storage.readFile(decodeURIComponent(m[1]));
    return file ? `data:${file.mime};base64,${file.bytes.toString("base64")}` : undefined;
  }

  try {
    if (kind === "video") {
      const video = await getVideoProvider().generate({
        prompt,
        sourceImage: await resolveSource(imageUrl),
      });
      const url = await storage.saveFile(crypto.randomUUID(), Buffer.from(video.b64, "base64"), video.mime);
      return NextResponse.json({ kind, url });
    }

    const source = kind === "edit" ? await resolveSource(imageUrl) : undefined;
    const [image] = await getImageProvider().generate({
      prompt,
      aspectRatio,
      ...(source ? { sourceImages: [source] } : {}),
    });
    if (!image) return NextResponse.json({ error: "provider returned no image" }, { status: 502 });
    const url = await storage.saveFile(crypto.randomUUID(), Buffer.from(image.b64, "base64"), image.mime);
    return NextResponse.json({ kind: kind === "edit" ? "edit" : "image", url });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
