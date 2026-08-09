/**
 * X API v2 chunked media upload (INIT → APPEND → FINALIZE → STATUS), used to
 * attach the campaign's poster image or teaser video to a post. Requires the
 * OAuth token to carry the media.write scope.
 */

const MEDIA_UPLOAD_URL = "https://api.x.com/2/media/upload";
const CHUNK_BYTES = 4 * 1024 * 1024;

function mediaError(step: string, status: number, detail: string): Error {
  if (status === 403) {
    return new Error(
      "Your X session can't upload media yet. Unlink in Settings and Sign in with X again to grant the new media permission, then retry."
    );
  }
  return new Error(`X media ${step} failed (${status}): ${detail.slice(0, 200)}`);
}

async function call(token: string, form: FormData, step: string): Promise<Record<string, unknown>> {
  const res = await fetch(MEDIA_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
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

export async function uploadMediaToX(
  token: string,
  bytes: Buffer,
  mime: string,
  kind: "image" | "video"
): Promise<string> {
  const category = kind === "video" ? "tweet_video" : mime === "image/gif" ? "tweet_gif" : "tweet_image";

  const init = new FormData();
  init.set("command", "INIT");
  init.set("total_bytes", String(bytes.length));
  init.set("media_type", mime);
  init.set("media_category", category);
  const initJson = await call(token, init, "INIT");
  const id = mediaId(initJson);
  if (!id) throw new Error("X media INIT returned no media id.");

  for (let seg = 0; seg * CHUNK_BYTES < bytes.length; seg++) {
    const chunk = bytes.subarray(seg * CHUNK_BYTES, (seg + 1) * CHUNK_BYTES);
    const append = new FormData();
    append.set("command", "APPEND");
    append.set("media_id", id);
    append.set("segment_index", String(seg));
    append.set("media", new Blob([new Uint8Array(chunk)], { type: mime }));
    await call(token, append, "APPEND");
  }

  const finalize = new FormData();
  finalize.set("command", "FINALIZE");
  finalize.set("media_id", id);
  const finalized = await call(token, finalize, "FINALIZE");

  // Videos process async: poll until X says succeeded (capped ~2 minutes).
  let info = ((finalized.data ?? finalized) as { processing_info?: ProcessingInfo }).processing_info;
  const deadline = Date.now() + 120_000;
  while (info && info.state && info.state !== "succeeded") {
    if (info.state === "failed") {
      throw new Error(`X rejected the media: ${info.error?.message ?? "processing failed"}.`);
    }
    if (Date.now() > deadline) throw new Error("X media processing timed out. Try again.");
    const waitSecs = Math.min(Math.max(info?.check_after_secs ?? 2, 1), 10);
    await new Promise((r) => setTimeout(r, waitSecs * 1000));
    const statusRes = await fetch(`${MEDIA_UPLOAD_URL}?command=STATUS&media_id=${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusText = await statusRes.text();
    if (!statusRes.ok) throw mediaError("STATUS", statusRes.status, statusText);
    try {
      const parsed = JSON.parse(statusText);
      info = ((parsed.data ?? parsed) as { processing_info?: ProcessingInfo }).processing_info;
    } catch {
      info = undefined;
    }
  }

  return id;
}
