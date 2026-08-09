/**
 * X API v2 media upload, used to attach the campaign's poster image or teaser
 * video to a post. Images go through the one-shot simple upload; videos go
 * through the chunked flow (initialize → append → finalize → status poll).
 * Requires the OAuth token to carry the media.write scope.
 */

const BASE = "https://api.x.com/2/media/upload";
const CHUNK_BYTES = 4 * 1024 * 1024;

function mediaError(step: string, status: number, detail: string): Error {
  if (status === 403) {
    return new Error(
      "Your X session can't upload media yet. Unlink in Settings and Sign in with X again to grant the new media permission, then retry."
    );
  }
  return new Error(`X media ${step} failed (${status}): ${detail.slice(0, 200)}`);
}

async function req(
  token: string,
  url: string,
  body: FormData | string | undefined,
  step: string,
  contentType?: string
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (contentType) headers["Content-Type"] = contentType;
  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) throw mediaError(step, res.status, text);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function mediaId(json: Record<string, unknown>): string | null {
  const data = (json.data ?? json) as Record<string, unknown>;
  const id = data.id ?? data.media_id_string ?? data.media_key;
  return typeof id === "string" && id ? id : null;
}

interface ProcessingInfo {
  state?: string;
  check_after_secs?: number;
  error?: { message?: string };
}

const processingInfo = (json: Record<string, unknown>): ProcessingInfo | undefined =>
  ((json.data ?? json) as { processing_info?: ProcessingInfo }).processing_info;

export async function uploadMediaToX(
  token: string,
  bytes: Buffer,
  mime: string,
  kind: "image" | "video"
): Promise<string> {
  const category = kind === "video" ? "tweet_video" : mime === "image/gif" ? "tweet_gif" : "tweet_image";

  // Images: one-shot simple upload — the file rides in the `media` form field.
  if (kind !== "video") {
    const form = new FormData();
    form.set("media", new Blob([new Uint8Array(bytes)], { type: mime }));
    form.set("media_category", category);
    const json = await req(token, BASE, form, "upload", undefined);
    const id = mediaId(json);
    if (!id) throw new Error("X media upload returned no media id.");
    return id;
  }

  // Videos: chunked flow with async processing.
  const initJson = await req(
    token,
    `${BASE}/initialize`,
    JSON.stringify({ media_type: mime, total_bytes: bytes.length, media_category: category }),
    "initialize",
    "application/json"
  );
  const id = mediaId(initJson);
  if (!id) throw new Error("X media initialize returned no media id.");

  for (let seg = 0; seg * CHUNK_BYTES < bytes.length; seg++) {
    const chunk = bytes.subarray(seg * CHUNK_BYTES, (seg + 1) * CHUNK_BYTES);
    const append = new FormData();
    append.set("segment_index", String(seg));
    append.set("media", new Blob([new Uint8Array(chunk)], { type: mime }));
    await req(token, `${BASE}/${id}/append`, append, "append", undefined);
  }

  const finalized = await req(token, `${BASE}/${id}/finalize`, undefined, "finalize", undefined);

  let info = processingInfo(finalized);
  const deadline = Date.now() + 120_000;
  while (info && info.state && info.state !== "succeeded") {
    if (info.state === "failed") {
      throw new Error(`X rejected the media: ${info.error?.message ?? "processing failed"}.`);
    }
    if (Date.now() > deadline) throw new Error("X media processing timed out. Try again.");
    const waitSecs = Math.min(Math.max(info?.check_after_secs ?? 2, 1), 10);
    await new Promise((r) => setTimeout(r, waitSecs * 1000));
    const statusRes = await fetch(`${BASE}?media_id=${id}&command=STATUS`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusText = await statusRes.text();
    if (!statusRes.ok) throw mediaError("status", statusRes.status, statusText);
    try {
      info = processingInfo(JSON.parse(statusText));
    } catch {
      info = undefined;
    }
  }

  return id;
}
