import type { AudienceSnapshot } from "./types";

/**
 * Thin an audience down to what a phone can render.
 *
 * Every member is an avatar sprite with its own GPU texture and its own image
 * download, so a thousand of them is a slideshow on mobile. Deep-profiled
 * members are always kept — they sit at measured positions and carry the
 * persona cards worth clicking — and the bio-assigned halo is sampled per
 * cluster so each tribe keeps its relative visual weight.
 *
 * Cluster sizes are NOT touched: the labels still report the real audience,
 * only the number of dots drawn changes.
 */

const DEFAULT_MAX_MEMBERS = Number(process.env.EXPLORE_MAX_MEMBERS) || 500;

/** Deterministic 0..1 from a string, so the same members survive every rebuild. */
function unit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function sampleForPublic(
  snapshot: AudienceSnapshot,
  maxMembers: number = DEFAULT_MAX_MEMBERS,
): AudienceSnapshot {
  const total = snapshot.members.length;
  if (total <= maxMembers) return snapshot;

  // Budget per cluster in proportion to how many members it actually has, so
  // the drawn galaxy keeps each tribe's relative weight. Within a cluster,
  // deep-profiled members go first (measured positions, clickable personas),
  // then the assigned halo — both in a stable hash order.
  const byCluster = new Map<string, typeof snapshot.members>();
  for (const m of snapshot.members) {
    const list = byCluster.get(m.clusterId);
    if (list) list.push(m);
    else byCluster.set(m.clusterId, [m]);
  }

  const kept: typeof snapshot.members = [];
  for (const [, list] of byCluster) {
    // At least one dot per tribe: a niche with no dots reads as "missing".
    const share = Math.max(1, Math.round((list.length / total) * maxMembers));
    const ordered = [...list].sort((a, b) => {
      if (!!b.deep !== !!a.deep) return b.deep ? 1 : -1;
      return unit(a.handle) - unit(b.handle);
    });
    kept.push(...ordered.slice(0, share));
  }
  return { ...snapshot, members: kept };
}
