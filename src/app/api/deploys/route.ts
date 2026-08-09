import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { getXAccessToken } from "@/lib/accounts/x-oauth";
import type { PostMetrics } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Posts published from Signal, enriched with live engagement from the X API
 * when an OAuth token is available. Without one (stub link), metrics are null
 * and the UI shows placeholders.
 */
export async function GET() {
  const deploys = await getStorage().listDeploys();
  if (deploys.length === 0) return NextResponse.json({ deploys: [], live: false });

  let metricsById: Record<string, PostMetrics> = {};
  let live = false;
  try {
    const token = await getXAccessToken();
    if (token) {
      // Batch lookup, newest 100 (the X API's per-request cap).
      const ids = deploys.slice(0, 100).map((d) => d.id).join(",");
      const res = await fetch(
        `https://api.x.com/2/tweets?ids=${ids}&tweet.fields=public_metrics`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      if (res.ok) {
        const json = await res.json();
        for (const t of json.data ?? []) {
          const m = t.public_metrics ?? {};
          metricsById[t.id] = {
            likes: m.like_count ?? 0,
            reposts: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
            replies: m.reply_count ?? 0,
            views: m.impression_count ?? 0,
            bookmarks: m.bookmark_count ?? 0,
          };
        }
        live = true;
      }
    }
  } catch {
    metricsById = {};
  }

  return NextResponse.json({
    live,
    deploys: deploys.map((d) => ({ ...d, metrics: metricsById[d.id] ?? null })),
  });
}
