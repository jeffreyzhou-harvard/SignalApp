import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Draft-first posting for the voice harness. Publishing requires ALL of:
 * confirm=true from the caller (the copilot only sets it after an explicit
 * spoken/typed yes), X_POSTING_ENABLED=true, and a linked account with a
 * write-scoped OAuth token. Anything less returns a safe draft preview.
 */
export async function POST(req: Request) {
  const { text, mediaUrl, confirm } = await req.json().catch(() => ({}));
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const draft = { text, mediaUrl: mediaUrl ?? null };
  const enabled = process.env.X_POSTING_ENABLED === "true";
  if (!confirm || !enabled) {
    return NextResponse.json({
      posted: false,
      draft,
      note: !enabled
        ? "X_POSTING_ENABLED is false — draft only."
        : "Draft preview. Call again with confirm=true after the founder approves.",
    });
  }

  const settings = await getStorage().getSettings();
  const accessToken = settings.xAccount?.accessToken;
  if (!accessToken) {
    return NextResponse.json({
      posted: false,
      draft,
      error: "no linked X account with write access",
    });
  }

  // Media upload needs the v1.1 chunked upload flow — out of scope for the
  // hackathon; the media URL rides in the text.
  const body = { text: mediaUrl ? `${text}\n${mediaUrl}` : text };
  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { posted: false, draft, error: `X API ${res.status}`, detail: json },
      { status: 502 },
    );
  }
  return NextResponse.json({ posted: true, id: json.data?.id, draft });
}
