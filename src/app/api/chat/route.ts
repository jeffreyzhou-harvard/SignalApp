import { NextResponse } from "next/server";
import { streamText, stepCountIs } from "ai";
import { xai } from "@ai-sdk/xai";
import { getStorage } from "@/lib/storage";
import { getImageProvider, getVideoProvider } from "@/lib/providers/registry";
import { mediaPromptError } from "@/lib/providers/limits";
import { getAudienceProvider } from "@/lib/audience/registry";
import { connectAudienceMcp } from "@/lib/mcp/audience-mcp";
import { buildLaunchSystemPrompt, toModelMessages } from "@/lib/agents/launch-copilot";
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
      const tooLong = mediaPromptError(styledPrompt, mediaType);
      if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 });
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

  // Ground the copilot in the founder's real audience (same snapshot the galaxy
  // renders) and connect the audience MCP so it can pull niche/member/interest
  // data live while it drafts the launch.
  const snapshot = await getAudienceProvider().getAudience({
    handle: settings.xAccount?.handle,
    projectId: project.id,
  });
  const mcp = await connectAudienceMcp();

  const system = buildLaunchSystemPrompt({ project, settings, snapshot, hasMcp: !!mcp });
  const modelMessages = await toModelMessages(history, async (url) => {
    const name = url.split("/").pop();
    if (!name) return null;
    const file = await storage.readFile(name);
    if (!file) return null;
    return `data:${file.mime};base64,${file.bytes.toString("base64")}`;
  });

  const model = process.env.XAI_TEXT_MODEL ?? "grok-4.5";

  try {
    const result = streamText({
      model: xai(model),
      system,
      messages: modelMessages,
      // Audience MCP tools (undefined if the MCP was unreachable → plain chat).
      tools: mcp?.tools,
      // The Vercel AI SDK tool loop: let Grok call audience tools, then answer.
      stopWhen: stepCountIs(8),
      abortSignal: req.signal,
      onFinish: async ({ text }) => {
        await mcp?.close();
        if (text.trim()) {
          await storage.appendMessage({
            id: crypto.randomUUID(),
            projectId: project.id,
            role: "assistant",
            kind: "text",
            content: text,
            images: [],
            model,
            createdAt: new Date().toISOString(),
          });
        }
      },
      onError: async () => {
        await mcp?.close();
      },
    });

    // Plain text stream keeps the existing ChatRoom reader contract unchanged.
    return result.toTextStreamResponse();
  } catch (err) {
    await mcp?.close();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat request failed." },
      { status: 502 }
    );
  }
}
