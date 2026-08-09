import type { AudienceCluster, AudienceMember, AudienceProvider, AudienceSnapshot } from "./types";
import { mockAudience } from "./mock";

/**
 * Real audience from the ingestion backend's GET /audience: the active cluster
 * run (clusters + members + persona docs) produced by the ml pipeline in
 * Postgres. Falls back to the seeded mock whenever the backend is unreachable
 * or has no active run yet, so the galaxy never renders empty.
 */

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/** Categorical niche colors (first six match the mock's palette). */
const PALETTE = ["#8b7cff", "#2fd6f6", "#ffb02e", "#ff7ac6", "#3ee6a0", "#6aa6ff", "#ff6369", "#f6d32f"];

// The galaxy's world box (matches the hand-tuned mock layout's extents).
const X_SPAN = 16;
const Y_SPAN = 8;
const Z_JITTER = 6;

interface BackendCluster {
  run_id: string;
  cluster_id: string;
  label: string;
  doc?: { one_liner?: string; keywords?: string[] } | null;
  size: number;
  share_of_audience?: number | null;
  engagement_index?: number | null;
}

interface BackendMember {
  user_id: string;
  cluster_id: string;
  periphery: boolean;
  confidence: number | null;
  map_x: number | null;
  map_y: number | null;
  doc?: {
    handle?: string;
    display_name?: string;
    bio?: string;
    profile_image_url?: string;
    persona_card?: { one_liner?: string } | null;
  } | null;
}

interface BackendSnapshot {
  run_id: string | null;
  seed_account_id: string | null;
  clusters: BackendCluster[];
  members: BackendMember[];
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pseudo-random in [-1, 1) from a string key. */
const jitter = (key: string) => ((hash(key) % 2000) / 1000) - 1;

/** Deterministic pseudo-random in [0, 1) from a string key. */
const unit = (key: string) => (hash(key) % 10000) / 10000;

/** X serves 48px `_normal` avatars; lift to the 400px variant. */
const upscaleAvatar = (url: string) => url.replace("_normal.", "_400x400.");

function mapSnapshot(snap: BackendSnapshot): AudienceSnapshot {
  const xs = snap.members.map((m) => m.map_x ?? 0);
  const ys = snap.members.map((m) => m.map_y ?? 0);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scaleX = maxX > minX ? (2 * X_SPAN) / (maxX - minX) : 1;
  const scaleY = maxY > minY ? (2 * Y_SPAN) / (maxY - minY) : 1;
  const px = (x: number) => (x - minX) * scaleX - X_SPAN;
  const py = (y: number) => (y - minY) * scaleY - Y_SPAN;

  // Deep-profiled members carry true UMAP positions; tier-1 members are written
  // with their cluster centroid's exact coords. Mirror the 2D audience map:
  // deep members sit at their measured spot, centroid-collided members scatter
  // into a confidence-scaled disc (confident → tight core, uncertain → far out).
  const coordCounts = new Map<string, number>();
  for (const m of snap.members) {
    const key = `${m.map_x}:${m.map_y}`;
    coordCounts.set(key, (coordCounts.get(key) ?? 0) + 1);
  }

  const members: AudienceMember[] = snap.members.map((m, i) => {
    const key = `${m.map_x}:${m.map_y}`;
    const collided = (coordCounts.get(key) ?? 1) > 1;
    const doc = m.doc ?? null;
    const deep = doc?.persona_card != null;
    const handle = doc?.handle ?? `@${m.user_id}`;
    let x = px(m.map_x ?? 0);
    let y = py(m.map_y ?? 0);
    let z = jitter(`${m.user_id}:z`) * Z_JITTER;
    if (collided) {
      // sqrt-uniform disc at constant density — a 550-member tribe gets a wide
      // halo, a 50-member one stays tight — shrunk further by assignment
      // confidence so uncertain members drift outward.
      const conf = Math.max(m.confidence ?? 1, 1);
      const n = coordCounts.get(key) ?? 1;
      const rBase = Math.min(6.5, 0.9 + 0.28 * Math.sqrt(n)) / conf;
      const r = rBase * Math.sqrt(0.05 + 0.95 * unit(`${m.user_id}:r`));
      const theta = unit(`${m.user_id}:t`) * Math.PI * 2;
      x += r * Math.cos(theta);
      y += r * Math.sin(theta) * (Y_SPAN / X_SPAN);
      z *= 0.05 + 0.95 * (r / rBase); // core stays flat, halo gains depth
    } else {
      x += jitter(`${m.user_id}:x`) * 0.6;
      y += jitter(`${m.user_id}:y`) * 0.6;
    }
    return {
      id: i,
      name: doc?.display_name || handle.replace(/^@/, ""),
      handle,
      bio: doc?.bio || doc?.persona_card?.one_liner || "",
      avatar: doc?.profile_image_url
        ? upscaleAvatar(doc.profile_image_url)
        : `/avatars/${hash(m.user_id) % 2 === 0 ? "m" : "f"}${hash(m.user_id) % 100}.jpg`,
      clusterId: m.cluster_id,
      pos: [x, y, z],
      deep,
      profileUrl: doc?.handle
        ? `https://x.com/${doc.handle.replace(/^@/, "")}`
        : `https://x.com/intent/user?user_id=${m.user_id}`,
    };
  });

  // Cluster centers = mean of the deep members' measured positions (they anchor
  // the tribe core); jittered tier-1 discs only fill in when no deep exist.
  const sums = new Map<string, { x: number; y: number; z: number; n: number }>();
  const accumulate = (m: AudienceMember) => {
    const acc = sums.get(m.clusterId) ?? { x: 0, y: 0, z: 0, n: 0 };
    acc.x += m.pos[0];
    acc.y += m.pos[1];
    acc.z += m.pos[2];
    acc.n++;
    sums.set(m.clusterId, acc);
  };
  const deepClusters = new Set(members.filter((m) => m.deep).map((m) => m.clusterId));
  for (const m of members) if (m.deep || !deepClusters.has(m.clusterId)) accumulate(m);

  const clusters: AudienceCluster[] = snap.clusters.map((c, i) => {
    const acc = sums.get(c.cluster_id);
    return {
      id: c.cluster_id,
      label: c.label,
      members: c.size,
      color: PALETTE[i % PALETTE.length],
      blurb: c.doc?.one_liner || (c.doc?.keywords ?? []).join(" · ") || "",
      center: acc && acc.n > 0 ? [acc.x / acc.n, acc.y / acc.n, acc.z / acc.n] : [0, 0, 0],
    };
  });

  return {
    totalFollowers: snap.clusters.reduce((sum, c) => sum + (c.size ?? 0), 0),
    clusters,
    members,
    source: `db:${snap.run_id}`,
    synthetic: false,
  };
}

export const dbAudience: AudienceProvider = {
  id: "db",
  label: "Clustered audience (backend)",

  async getAudience(input) {
    try {
      const res = await fetch(`${BACKEND_URL}/audience`, { cache: "no-store" });
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const snap: BackendSnapshot = await res.json();
      // No active run (or an empty one) → the fixture clusters carry no member
      // coordinates, so the seeded mock stays the honest visual.
      if (!snap.run_id || snap.members.length === 0) {
        return mockAudience.getAudience(input);
      }
      return mapSnapshot(snap);
    } catch {
      return mockAudience.getAudience(input);
    }
  },
};
