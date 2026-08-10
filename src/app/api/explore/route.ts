import { NextResponse } from "next/server";
import { getAudienceProvider } from "@/lib/audience/registry";
import { canonicalExploreHandle, DEFAULT_EXPLORE_HANDLE } from "@/lib/audience/explore";
import { sampleForPublic } from "@/lib/audience/sample";
import type { AudienceSnapshot } from "@/lib/audience/types";

export const runtime = "nodejs";
/** Cluster runs are immutable once activated, so an hour-old map is still correct. */
export const revalidate = 3600;

/**
 * Public, unauthenticated audience maps for the `/explore` screen.
 *
 * Deliberately separate from `/api/audience`: it serves only the allowlisted
 * demo handles (never the viewer's own settings or another ingested account),
 * downsamples for phones, and is cached so a burst of traffic can't hammer the
 * ingest backend. If the backend is unreachable but we served this audience
 * earlier in the process, the last good map is served stale rather than
 * showing a stranger an error or, worse, synthetic data presented as real.
 */

const lastGood = new Map<string, AudienceSnapshot>();

export async function GET(req: Request) {
  const requested = new URL(req.url).searchParams.get("handle");
  const handle = canonicalExploreHandle(requested) ?? (requested ? null : DEFAULT_EXPLORE_HANDLE);
  if (!handle) {
    return NextResponse.json({ error: "Unknown audience." }, { status: 404 });
  }

  try {
    const snapshot = await getAudienceProvider().getAudience({ handle });
    // The provider falls back to the seeded mock when the backend is down; on a
    // public page that would be fiction dressed as data, so refuse it.
    if (snapshot.synthetic) throw new Error("backend unavailable");
    const publicSnapshot = sampleForPublic(snapshot);
    lastGood.set(handle, publicSnapshot);
    return NextResponse.json(publicSnapshot);
  } catch {
    const stale = lastGood.get(handle);
    if (stale) return NextResponse.json(stale);
    return NextResponse.json(
      { error: "The audience maps are warming up. Try again in a moment." },
      { status: 503 },
    );
  }
}
