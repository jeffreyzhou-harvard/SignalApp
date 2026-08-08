import type {
  GeneratedImage,
  GeneratedVideo,
  ImageGenOptions,
  ImageProvider,
  TextProvider,
  TextStreamOptions,
  VideoGenOptions,
  VideoProvider,
} from "./types";

const XAI_BASE_URL = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";

function apiKey(): string {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    throw new Error(
      "XAI_API_KEY is not set. Copy .env.example to .env.local and add your xAI API key."
    );
  }
  return key;
}

/** Grok text via the OpenAI-compatible chat completions endpoint. */
export const grokText: TextProvider = {
  id: "grok",
  label: "Grok",
  defaultModel: process.env.XAI_TEXT_MODEL ?? "grok-4.5",

  async *stream({ messages, model, signal }: TextStreamOptions) {
    const res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({
        model: model ?? grokText.defaultModel,
        messages,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Grok API error ${res.status}: ${detail.slice(0, 400)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload);
          const delta: string | undefined = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Partial JSON split across chunks lands back in the buffer next read.
        }
      }
    }
  },
};

/** Grok Imagine via the images/generations endpoint. */
export const grokImagine: ImageProvider = {
  id: "grok-imagine",
  label: "Grok Imagine",
  defaultModel: process.env.XAI_IMAGE_MODEL ?? "grok-imagine-image-quality",

  async generate({ prompt, model, n, aspectRatio, resolution, sourceImages, signal }: ImageGenOptions): Promise<GeneratedImage[]> {
    // With a source image the call becomes an edit: the upload grounds the render.
    // The edits endpoint documents a single source image; extras are ignored here.
    const editing = !!sourceImages?.length;
    const endpoint = editing ? "images/edits" : "images/generations";
    const body = editing
      ? {
          model: model ?? grokImagine.defaultModel,
          prompt,
          image: { url: sourceImages![0], type: "image_url" },
        }
      : {
          model: model ?? grokImagine.defaultModel,
          prompt,
          n: n ?? 1,
          ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
          ...(resolution ? { resolution } : {}),
          response_format: "b64_json",
        };
    const res = await fetch(`${XAI_BASE_URL}/${endpoint}`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Grok Imagine API error ${res.status}: ${detail.slice(0, 400)}`);
    }

    const json = await res.json();
    const items: { b64_json?: string; url?: string }[] = json.data ?? [];
    const images: GeneratedImage[] = [];
    for (const item of items) {
      if (item.b64_json) {
        images.push({ b64: item.b64_json, mime: "image/jpeg" });
      } else if (item.url) {
        const imgRes = await fetch(item.url, { signal });
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const mime = imgRes.headers.get("content-type") ?? "image/jpeg";
        images.push({ b64: buf.toString("base64"), mime });
      }
    }
    if (images.length === 0) throw new Error("Grok Imagine returned no images.");
    return images;
  },
};

const VIDEO_POLL_MS = 5000;
const VIDEO_TIMEOUT_MS = 4 * 60 * 1000;

/** Grok Imagine video: async request + poll until done, then download. */
export const grokImagineVideo: VideoProvider = {
  id: "grok-imagine-video",
  label: "Grok Imagine Video",
  defaultModel: process.env.XAI_VIDEO_MODEL ?? "grok-imagine-video-1.5",

  async generate({ prompt, model, duration, aspectRatio, resolution, sourceImage, signal }: VideoGenOptions): Promise<GeneratedVideo> {
    const start = await fetch(`${XAI_BASE_URL}/videos/generations`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({
        model: model ?? grokImagineVideo.defaultModel,
        prompt,
        duration: duration ?? 6,
        // Image-to-video defaults to the source's aspect ratio; only force one without a source.
        ...(sourceImage ? { image: { url: sourceImage } } : { aspect_ratio: aspectRatio ?? "16:9" }),
        resolution: resolution ?? "720p",
      }),
    });
    if (!start.ok) {
      const detail = await start.text().catch(() => "");
      throw new Error(`Grok Imagine video error ${start.status}: ${detail.slice(0, 400)}`);
    }
    const { request_id: requestId } = await start.json();
    if (!requestId) throw new Error("Grok Imagine video returned no request_id.");

    const deadline = Date.now() + VIDEO_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, VIDEO_POLL_MS));
      const poll = await fetch(`${XAI_BASE_URL}/videos/${requestId}`, {
        signal,
        headers: { Authorization: `Bearer ${apiKey()}` },
      });
      if (!poll.ok) continue;
      const json = await poll.json();
      if (json.status === "done" && json.video?.url) {
        const vidRes = await fetch(json.video.url, { signal });
        if (!vidRes.ok) throw new Error(`Could not download the generated video (${vidRes.status}).`);
        const buf = Buffer.from(await vidRes.arrayBuffer());
        return {
          b64: buf.toString("base64"),
          mime: vidRes.headers.get("content-type") ?? "video/mp4",
          duration: json.video.duration,
        };
      }
      if (json.status === "failed") throw new Error("Grok Imagine video generation failed.");
      if (json.status === "expired") throw new Error("Grok Imagine video request expired.");
    }
    throw new Error("Grok Imagine video timed out. Try a shorter duration.");
  },
};
