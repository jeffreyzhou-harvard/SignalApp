import type { AudienceSnapshot } from "./types";
import { getAudienceProvider } from "./registry";

/**
 * Server-side cache for the mapped audience snapshot.
 *
 * The provider re-fetches the backend (`cache: "no-store"`) and re-maps every
 * follower on each call, so without this every `/api/audience` request — every
 * first load, reload, and new tab, for every visitor — pays the full cost. This
 * memoizes the mapped snapshot per resolved key with stale-while-revalidate:
 * a warm process serves instantly and refreshes in the background when stale.
 *
 * In-memory and per-process (shared across requests to a warm server, warmed
 * per-instance in serverless). Keyed by the *resolved* handle + projectId, so a
 * settings change that swaps the handle is a natural cache miss.
 */

const TTL_MS = Number(process.env.AUDIENCE_CACHE_TTL_MS ?? 60_000);

interface Input {
  handle?: string;
  projectId?: string;
}

interface Entry {
  snapshot: AudienceSnapshot;
  ts: number;
}

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<AudienceSnapshot>>();

const keyOf = (i: Input) => `${i.handle ?? ""}|${i.projectId ?? ""}`;

function refresh(key: string, input: Input): Promise<AudienceSnapshot> {
  const existing = inflight.get(key);
  if (existing) return existing; // collapse a stampede onto one backend call

  const p = getAudienceProvider()
    .getAudience(input)
    .then((snapshot) => {
      mem.set(key, { snapshot, ts: Date.now() });
      return snapshot;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/**
 * Resolve the snapshot, preferring the process cache. A fresh entry is returned
 * with no backend call; a stale entry is returned immediately while a refresh
 * runs in the background; a cold key blocks on the first fetch.
 */
export function getCachedAudience(input: Input): Promise<AudienceSnapshot> {
  const key = keyOf(input);
  const entry = mem.get(key);
  if (!entry) return refresh(key, input);

  if (Date.now() - entry.ts >= TTL_MS && !inflight.has(key)) {
    void refresh(key, input).catch(() => {
      // Keep serving the stale snapshot; a later request retries the refresh.
    });
  }
  return Promise.resolve(entry.snapshot);
}
