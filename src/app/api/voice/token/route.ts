import { NextResponse } from "next/server";
import { buildSessionPayload } from "@/lib/voice/session";
import { getAudienceProvider } from "@/lib/audience/registry";
import { resolveAudienceHandle } from "@/lib/audience/resolve";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const XAI_BASE_URL = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";

export async function POST(req: Request) {
  const key = process.env.XAI_API_KEY;
  if (!key) return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });

  const { projectId } = await req.json().catch(() => ({ projectId: undefined }));

  // Mint a short-lived client secret (docs: POST /v1/realtime/client_secrets;
  // the endpoint does not accept a `session` field, so config rides alongside).
  const mint = await fetch(`${XAI_BASE_URL}/realtime/client_secrets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
  });
  if (!mint.ok) {
    const detail = await mint.text().catch(() => "");
    return NextResponse.json(
      { error: `token mint failed: ${mint.status} ${detail.slice(0, 200)}` },
      { status: 502 },
    );
  }
  const minted = await mint.json();
  // Field name per docs example; fall back defensively across shapes.
  const token: string | undefined = minted.client_secret?.value ?? minted.value ?? minted.token;
  if (!token) return NextResponse.json({ error: "no token in mint response" }, { status: 502 });

  const settings = await getStorage().getSettings();
  const snapshot = await getAudienceProvider().getAudience({
    handle: resolveAudienceHandle(settings),
    projectId,
  });

  const sessionPayload = buildSessionPayload({
    clusters: snapshot.clusters,
    totalFollowers: snapshot.totalFollowers,
    mcpUrl: process.env.AUDIENCE_MCP_URL || undefined,
    mcpToken: process.env.AUDIENCE_MCP_TOKEN || undefined,
    voice: process.env.XAI_VOICE || undefined,
  });

  return NextResponse.json({
    token,
    model: process.env.XAI_VOICE_MODEL ?? "grok-voice-latest",
    sessionPayload,
  });
}
