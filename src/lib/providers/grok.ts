import type {
  GeneratedImage,
  ImageGenOptions,
  ImageProvider,
  TextProvider,
  TextStreamOptions,
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
  defaultModel: process.env.XAI_IMAGE_MODEL ?? "grok-imagine-image",

  async generate({ prompt, model, n, aspectRatio, signal }: ImageGenOptions): Promise<GeneratedImage[]> {
    const res = await fetch(`${XAI_BASE_URL}/images/generations`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({
        model: model ?? grokImagine.defaultModel,
        prompt,
        n: n ?? 1,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        response_format: "b64_json",
      }),
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
