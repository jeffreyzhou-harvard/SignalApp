import { NextResponse } from "next/server";
import { getCachedAudience } from "@/lib/audience/server-cache";
import { resolveAudienceHandle } from "@/lib/audience/resolve";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const projectId = params.get("projectId") ?? undefined;
  const settings = await getStorage().getSettings();
  const snapshot = await getCachedAudience({
    // explicit per-project handle wins; the settings picker covers the rest
    handle: resolveAudienceHandle(settings, params.get("handle")),
    projectId,
  });
  return NextResponse.json(snapshot, {
    // Per-account data, so keep it out of shared caches; let the browser reuse
    // it for a reload/new-tab, and serve-while-revalidating past that.
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
    },
  });
}
