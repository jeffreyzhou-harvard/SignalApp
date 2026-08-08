import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { getImageProvider, getTextProvider } from "@/lib/providers/registry";
import { buildCopilotMessages } from "@/lib/copilot";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ChatRequest {
  projectId: string;
  text: string;
  images?: string[];
  mode?: "text" | "imagine";
}

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
      const provider = getImageProvider();
      const generated = await provider.generate({ prompt, aspectRatio: "1:1" });
      const urls: string[] = [];
      for (const img of generated) {
        const url = await storage.saveFile(crypto.randomUUID(), Buffer.from(img.b64, "base64"), img.mime);
        urls.push(url);
      }
      const assistant: ChatMessage = {
        id: crypto.randomUUID(),
        projectId: project.id,
        role: "assistant",
        kind: "image",
        content: prompt,
        images: urls,
        model: provider.defaultModel,
        createdAt: new Date().toISOString(),
      };
      await storage.appendMessage(assistant);
      await storage.updateProject(project.id, { thumbnail: urls[0] ?? null });
      return NextResponse.json({ message: assistant });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Image generation failed." },
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
