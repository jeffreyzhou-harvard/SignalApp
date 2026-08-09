/**
 * Fetches X post metrics (public + owner-only non_public/organic) and maps them
 * to PostMetrics. Owner-only fields are undefined when the token lacks author
 * context or the post is older than 30 days (X omits them). I/O is injected so
 * the module is unit-testable.
 */

import type { PostMetrics } from "@/lib/types";

const X_TWEETS_URL = "https://api.x.com/2/tweets";
const TWEET_FIELDS = "public_metrics,non_public_metrics,organic_metrics";
const MAX_IDS = 100;

/** Coerce a possibly-missing value into a finite number, defaulting to 0. */
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Map a single X tweet object to our PostMetrics shape. Gracefully degrades:
 * public fields default to 0, owner-only fields (from non_public_metrics) are
 * left undefined when absent.
 */
export function mapTweetToMetrics(tweet: any): PostMetrics {
  const pub = tweet?.public_metrics ?? {};
  const nonPub = tweet?.non_public_metrics ?? {};

  const likes = num(pub.like_count);
  const reposts = num(pub.retweet_count) + num(pub.quote_count);
  const replies = num(pub.reply_count);
  const bookmarks = num(pub.bookmark_count);

  // Prefer owner-only impression_count when present and > 0 (more accurate).
  const nonPubViews = num(nonPub.impression_count);
  const views = nonPubViews > 0 ? nonPubViews : num(pub.impression_count);

  const linkClicks =
    nonPub.url_link_clicks != null ? num(nonPub.url_link_clicks) : undefined;
  const profileClicks =
    nonPub.user_profile_clicks != null
      ? num(nonPub.user_profile_clicks)
      : undefined;
  const engagements =
    nonPub.engagements != null ? num(nonPub.engagements) : undefined;

  const engagementRate =
    views > 0 ? ((likes + reposts + replies + bookmarks) / views) * 100 : 0;

  return {
    likes,
    reposts,
    replies,
    views,
    bookmarks,
    linkClicks,
    profileClicks,
    engagements,
    engagementRate,
  };
}

/**
 * Fetch metrics for up to 100 tweet ids and return a record keyed by tweet id.
 * `fetchImpl` is injectable so tests can supply a mock without hitting the
 * network. Throws on a non-ok response; the caller decides on fallback.
 */
export async function fetchMetrics(
  token: string,
  ids: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, PostMetrics>> {
  const batch = ids.slice(0, MAX_IDS);
  if (batch.length === 0) return {};

  const url = `${X_TWEETS_URL}?ids=${batch.join(",")}&tweet.fields=${TWEET_FIELDS}`;

  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore body read failures; status alone is still useful
    }
    throw new Error(
      `X metrics request failed: ${res.status} ${res.statusText}${
        body ? ` — ${body}` : ""
      }`,
    );
  }

  const json = await res.json();
  const result: Record<string, PostMetrics> = {};
  for (const t of json?.data ?? []) {
    result[t.id] = mapTweetToMetrics(t);
  }
  return result;
}
