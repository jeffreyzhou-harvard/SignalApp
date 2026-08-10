import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getAudienceProvider } from "@/lib/audience/registry";
import { canonicalExploreHandle, DEFAULT_EXPLORE_HANDLE } from "@/lib/audience/explore";
import { sampleForPublic } from "@/lib/audience/sample";
import type { AudienceSnapshot } from "@/lib/audience/types";

export const runtime = "nodejs";

/**
 * Public, unauthenticated audience maps for the `/explore` screen.
 *
 * Deliberately separate from `/api/audience`: it serves only the allowlisted
 * demo handles (never the viewer's own settings or another ingested account)
 * and downsamples for phones.
 *
 * Caching matters more than usual here, because this is the page a link from
 * social lands on and the ingest backend behind it is a single small instance
 * that takes seconds to assemble a full audience. Three layers protect it:
 * the CDN (via Cache-Control, so most visitors never reach this function),
 * the data cache (so a function miss still doesn't reach the backend), and a
 * per-instance last-good copy (so a cold or failing backend serves a slightly
 * stale map instead of an error). Cluster runs are immutable once activated,
 * so serving an hour-old map is correct, not just convenient.
 */

const ONE_HOUR = 3600;

const lastGood = new Map<string, AudienceSnapshot>();

const loadPublicAudience = unstable_cache(
  async (handle: string): Promise<AudienceSnapshot> => {
    const snapshot = await getAudienceProvider().getAudience({ handle });
    // The provider falls back to the seeded mock when the backend is down; on
    // a public page that would be fiction dressed as data, so refuse it.
    if (snapshot.synthetic) throw new Error("backend unavailable");
    return sampleForPublic(snapshot);
  },
  ["explore-audience"],
  { revalidate: ONE_HOUR, tags: ["explore-audience"] },
);

export async function GET(req: Request) {
  const requested = new URL(req.url).searchParams.get("handle");
  const handle = canonicalExploreHandle(requested) ?? (requested ? null : DEFAULT_EXPLORE_HANDLE);
  if (!handle) {
    return NextResponse.json({ error: "Unknown audience." }, { status: 404 });
  }

  try {
    const snapshot = await loadPublicAudience(handle);
    lastGood.set(handle, snapshot);
    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": `public, s-maxage=${ONE_HOUR}, stale-while-revalidate=86400`,
      },
    });
  } catch {
    const stale = lastGood.get(handle);
    if (stale) {
      return NextResponse.json(stale, {
        // Short window: retry the backend soon, but keep serving meanwhile.
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600" },
      });
    }
    return NextResponse.json(
      { error: "The audience maps are warming up. Try again in a moment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
