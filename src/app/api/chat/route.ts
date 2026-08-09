import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { getImageProvider, getTextProvider, getVideoProvider } from "@/lib/providers/registry";
import { buildCopilotMessages } from "@/lib/copilot";
import { applyStyle } from "@/lib/styles";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ChatRequest {
  projectId: string;
  text: string;
  images?: string[];
  mode?: "text" | "imagine";
  /** Which media Imagine mode produces. Defaults to image. */
  mediaType?: "image" | "video";
  /** Image aspect ratio (xAI enum) and resolution. */
  aspectRatio?: string;
  resolution?: "1k" | "2k";
  /** Video length in seconds (1–15, user-selected). Video always renders 1080p. */
  videoDuration?: number;
  /** Style preset id from src/lib/styles.ts. */
  style?: string;
}

const VALID_RATIOS = new Set([
  "auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2", "19.5:9", "9:19.5", "20:9", "9:20",
]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ChatRequest | null;
  if (!body?.projectId || typeof body.text !== "string") {
    return NextResponse.json({ error: "projectId and text are required." }, { status: 400 });
  }

  const storage = getStorage();
  const project = await storage.getProject(body.projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const text = body.text.trim();
  const imagineCommand = text.startsWith("/imagine ");
  const mode = body.mode === "imagine" || imagineCommand ? "imagine" : "text";
  const prompt = imagineCommand ? text.slice("/imagine ".length).trim() : text;

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    projectId: project.id,
    role: "user",
    kind: "text",
    content: text,
    images: body.images ?? [],
    createdAt: new Date().toISOString(),
  };
  await storage.appendMessage(userMessage);

  if (mode === "imagine") {
    try {
      const mediaType = body.mediaType === "video" ? "video" : "image";
      const styledPrompt = applyStyle(prompt, body.style);
      const urls: string[] = [];
      let modelUsed: string;

      // Attached uploads ground the render: image mode edits on them, video mode
      // animates from the first one as its starting frame.
      const sources: string[] = [];
      for (const url of userMessage.images.slice(0, 3)) {
        const name = url.split("/").pop();
        if (!name) continue;
        const file = await storage.readFile(name);
        if (file) sources.push(`data:${file.mime};base64,${file.bytes.toString("base64")}`);
      }

      if (mediaType === "video") {
        const provider = getVideoProvider();
        const video = await provider.generate({
          prompt: styledPrompt,
          sourceImage: sources[0],
          duration: Math.min(15, Math.max(1, Math.round(Number(body.videoDuration) || 10))),
          resolution: "1080p",
        });
        urls.push(await storage.saveFile(crypto.randomUUID(), Buffer.from(video.b64, "base64"), video.mime));
        modelUsed = provider.defaultModel;
      } else {
        const provider = getImageProvider();
        const aspectRatio =
          body.aspectRatio && VALID_RATIOS.has(body.aspectRatio) ? body.aspectRatio : "auto";
        const resolution = body.resolution === "2k" ? "2k" : "1k";
        const generated = await provider.generate({
          prompt: styledPrompt,
          aspectRatio,
          resolution,
          sourceImages: sources,
        });
        for (const img of generated) {
          urls.push(await storage.saveFile(crypto.randomUUID(), Buffer.from(img.b64, "base64"), img.mime));
        }
        modelUsed = provider.defaultModel;
      }

      const assistant: ChatMessage = {
        id: crypto.randomUUID(),
        projectId: project.id,
        role: "assistant",
        kind: mediaType,
        content: prompt,
        images: urls,
        model: modelUsed,
        createdAt: new Date().toISOString(),
      };
      await storage.appendMessage(assistant);
      if (mediaType === "image") {
        await storage.updateProject(project.id, { thumbnail: urls[0] ?? null });
      }
      return NextResponse.json({ message: assistant });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Media generation failed." },
        { status: 502 }
      );
    }
  }

  const settings = await storage.getSettings();
  const history = await storage.listMessages(project.id);
  const providerMessages = await buildCopilotMessages(project, settings, history, async (url) => {
    const name = url.split("/").pop();
    if (!name) return null;
    const file = await storage.readFile(name);
    if (!file) return null;
    return `data:${file.mime};base64,${file.bytes.toString("base64")}`;
  });

  const provider = getTextProvider();
  const encoder = new TextEncoder();
  let full = "";

  try {
    const iterator = provider.stream({ messages: providerMessages, signal: req.signal })[Symbol.asyncIterator]();
    const first = await iterator.next();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (!first.done && first.value) {
            full += first.value;
            controller.enqueue(encoder.encode(first.value));
          }
          while (true) {
            const { done, value } = await iterator.next();
            if (done) break;
            full += value;
            controller.enqueue(encoder.encode(value));
          }
        } catch (err) {
          const note = `\n\n[Grok stream interrupted: ${err instanceof Error ? err.message : "unknown error"}]`;
          full += note;
          controller.enqueue(encoder.encode(note));
        } finally {
          if (full.trim()) {
            await storage.appendMessage({
              id: crypto.randomUUID(),
              projectId: project.id,
              role: "assistant",
              kind: "text",
              content: full,
              images: [],
              model: provider.defaultModel,
              createdAt: new Date().toISOString(),
            });
          }
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat request failed." },
      { status: 502 }
    );
  }
}
