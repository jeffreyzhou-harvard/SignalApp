import { NextResponse } from "next/server";
import { getXAccessToken } from "@/lib/accounts/x-oauth";
import { getStorage } from "@/lib/storage";
import type { DeployPrediction } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Coerce a loosely-typed request body into a DeployPrediction, or null. Keeps
 * bad/partial payloads from being persisted while accepting the compact shape
 * the campaign panel sends after a wind-tunnel verdict.
 */
function parsePrediction(raw: unknown): DeployPrediction | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.winner !== "A" && p.winner !== "B") return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    winner: p.winner,
    predictedLiftPct: num(p.predictedLiftPct),
    confidencePct: num(p.confidencePct),
    driver: typeof p.driver === "string" ? p.driver : "",
    predictedEngagementRate: num(p.predictedEngagementRate),
    provider: typeof p.provider === "string" ? p.provider : "unknown",
    agentCount: num(p.agentCount),
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Publishes a post from the founder's own linked X account (OAuth token with
 * tweet.write, refreshed transparently by getXAccessToken). Text-first:
 * attaching media needs X's chunked upload and is a follow-up — locally-stored
 * media URLs are not public, so they are never appended to the text.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  const prediction = parsePrediction(body?.prediction);
  if (!text) return NextResponse.json({ error: "text is required." }, { status: 400 });
  if (text.length > 280) {
    return NextResponse.json({ error: "Post is over 280 characters." }, { status: 400 });
  }

  const settings = await getStorage().getSettings();
  if (!settings.xAccount) {
    return NextResponse.json(
      { posted: false, error: "No X account linked. Connect one in Settings first." },
      { status: 400 }
    );
  }

  let token: string | null = null;
  try {
    token = await getXAccessToken();
  } catch (err) {
    return NextResponse.json(
      { posted: false, error: err instanceof Error ? err.message : "Token refresh failed." },
      { status: 502 }
    );
  }
  if (!token) {
    return NextResponse.json(
      {
        posted: false,
        error:
          "The linked account has no OAuth access token (local stub link). Sign in with X once OAuth credentials are configured.",
      },
      { status: 400 }
    );
  }

  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { posted: false, error: `X API ${res.status}: ${JSON.stringify(json).slice(0, 200)}` },
      { status: 502 }
    );
  }
  const id: string | undefined = json.data?.id;
  const url = id ? `https://x.com/${settings.xAccount.handle}/status/${id}` : null;
  if (id) {
    await getStorage().recordDeploy({
      id,
      text,
      url,
      handle: settings.xAccount.handle,
      projectId,
      createdAt: new Date().toISOString(),
      prediction,
    });
  }
  return NextResponse.json({ posted: true, id, url });
}
