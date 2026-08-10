import type { AudienceSnapshot } from "./types";

/**
 * Client-side cache for the audience snapshot (`/api/audience`).
 *
 * The snapshot is the whole galaxy — every follower with their full profile —
 * so re-fetching it on each `GalaxyView` mount makes navigating to
 * `dashboard/audience` (or bouncing between tabs) feel slow. This gives
 * stale-while-revalidate: an instant paint from cache on revisit, with a quiet
 * background refresh. In-memory covers client navigation; sessionStorage covers
 * a full reload within the same tab.
 *
 * Keyed only by the params the client knows (`projectId`, `handle`); the server
 * resolves the effective handle, so identical client params → identical result.
 */

export interface SnapshotParams {
  projectId?: string;
  handle?: string | null;
  /** "explore" reads the public demo maps (`/api/explore`) instead of the
   * viewer's own audience — used by the signed-out explore screen. */
  source?: "audience" | "explore";
}

/** Within this window a cache hit is served without a background revalidate. */
const FRESH_MS = 2 * 60 * 1000;
const SS_PREFIX = "agentsim:audience:";

interface Entry {
  snapshot: AudienceSnapshot;
  ts: number;
}

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<AudienceSnapshot>>();

function keyOf({ projectId, handle, source }: SnapshotParams): string {
  return `s=${source ?? "audience"}&p=${projectId ?? ""}&h=${handle ?? ""}`;
}

function readSession(key: string): Entry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SS_PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, entry: Entry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded on a huge audience — the in-memory cache still covers the session.
  }
}

/** Newest known entry (memory wins), promoting a sessionStorage hit into memory. */
function peek(key: string): Entry | null {
  const hit = mem.get(key) ?? readSession(key);
  if (hit && !mem.has(key)) mem.set(key, hit);
  return hit;
}

/** Synchronous best-effort read for an instant first paint. */
export function getCachedSnapshot(params: SnapshotParams): AudienceSnapshot | null {
  return peek(keyOf(params))?.snapshot ?? null;
}

function endpoint(params: SnapshotParams): string {
  const qs = new URLSearchParams();
  if (params.source === "explore") {
    if (params.handle) qs.set("handle", params.handle);
    return `/api/explore${qs.size ? `?${qs}` : ""}`;
  }
  if (params.projectId) qs.set("projectId", params.projectId);
  if (params.handle) qs.set("handle", params.handle);
  return `/api/audience${qs.size ? `?${qs}` : ""}`;
}

async function fetchFresh(params: SnapshotParams): Promise<AudienceSnapshot> {
  const key = keyOf(params);
  const existing = inflight.get(key);
  if (existing) return existing; // dedupe concurrent mounts (incl. StrictMode double-mount)

  const p = (async () => {
    const res = await fetch(endpoint(params));
    if (!res.ok) throw new Error(`audience ${res.status}`);
    const snapshot = (await res.json()) as AudienceSnapshot;
    const entry: Entry = { snapshot, ts: Date.now() };
    mem.set(key, entry);
    writeSession(key, entry);
    return snapshot;
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Resolve the snapshot, preferring cache. A fresh-enough cache hit is returned
 * without a network call; a stale hit is returned by the caller (via
 * {@link getCachedSnapshot}) while this revalidates in the background. Pass
 * `force` to bypass the cache entirely (e.g. a "try again" retry).
 */
export async function ensureSnapshot(
  params: SnapshotParams,
  opts: { force?: boolean } = {},
): Promise<AudienceSnapshot> {
  const entry = peek(keyOf(params));
  if (!opts.force && entry && Date.now() - entry.ts < FRESH_MS) return entry.snapshot;
  return fetchFresh(params);
}
