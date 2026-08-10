/**
 * The audiences anyone can explore without an account — the public demo maps.
 *
 * This list is the allowlist for `/api/explore`: the public route serves these
 * handles and nothing else, so the endpoint can't be used to enumerate other
 * ingested audiences.
 */

export interface ExploreAudience {
  /** X handle, without the @. Must match an ingested audience in the backend. */
  handle: string;
  /** Short label for the toggle. */
  name: string;
  /** One line on why this audience is interesting. */
  blurb: string;
}

export const EXPLORE_AUDIENCES: ExploreAudience[] = [
  {
    handle: "ishand",
    name: "@ishand",
    blurb: "A founder's followers — five tribes, from infra engineers to investors.",
  },
  {
    handle: "SpaceXAI",
    name: "@SpaceXAI",
    blurb: "A company's engaged audience — the people who like and repost, not passive followers.",
  },
];

export const DEFAULT_EXPLORE_HANDLE = EXPLORE_AUDIENCES[0].handle;

export function isExploreHandle(handle: string | null | undefined): boolean {
  const h = (handle ?? "").replace(/^@/, "").toLowerCase();
  return EXPLORE_AUDIENCES.some((a) => a.handle.toLowerCase() === h);
}

/** The allowlisted handle in its canonical casing, or null. */
export function canonicalExploreHandle(handle: string | null | undefined): string | null {
  const h = (handle ?? "").replace(/^@/, "").toLowerCase();
  return EXPLORE_AUDIENCES.find((a) => a.handle.toLowerCase() === h)?.handle ?? null;
}
