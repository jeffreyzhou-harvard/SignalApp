/**
 * Pluggable audience data. The mock adapter ships seeded demo niches; the real
 * pipeline (X ingest → persona docs → embed → cluster, see docs/ARCHITECTURE.md)
 * implements this same interface later — the galaxy UI never changes.
 */

export interface AudienceCluster {
  id: string;
  label: string;
  /** Real audience size this niche represents. */
  members: number;
  /** Categorical data color for nodes/edges/labels. */
  color: string;
  blurb: string;
  /** Hand-tuned (or layout-computed) 3D centroid. */
  center: [number, number, number];
}

/** Everything the pipeline stores for one account, for the profile card. */
export interface MemberProfile {
  location?: string | null;
  verified?: boolean;
  verifiedType?: string | null;
  accountAgeDays?: number | null;
  /** How they relate to the seed account: "follower" | "engager". */
  relationship?: string | null;
  /** 2 = deep (Grok-enriched) persona. */
  enrichmentTier?: number | null;
  metrics?: {
    followers?: number | null;
    following?: number | null;
    tweets?: number | null;
    listed?: number | null;
  };
  /** Their engagement with the seed account's posts. */
  seedEngagement?: { likes?: number | null; reposts?: number | null; replies?: number | null };
  card?: {
    archetype?: string;
    oneLiner?: string;
    summary?: string;
    toneAffinity?: string;
    interests?: string[];
    conversionLevers?: string[];
    preferredFormats?: string[];
  };
  samplePosts?: string[];
  /** Canonical X profile URL. */
  profileUrl?: string | null;
  confidence?: number | null;
  periphery?: boolean;
}

export interface AudienceMember {
  id: number;
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  clusterId: string;
  pos: [number, number, number];
  /** False for bio-only tier-1 members placed by confidence jitter, not a measured position. */
  deep?: boolean;
  /** Real X profile link; absent for synthetic members. */
  profileUrl?: string;
  /** Full stored persona; absent on sample data. */
  profile?: MemberProfile;
}

export interface AudienceSnapshot {
  totalFollowers: number;
  clusters: AudienceCluster[];
  members: AudienceMember[];
  /** Which provider produced this — the UI labels mock data as a sample. */
  source: string;
  synthetic: boolean;
}

export interface AudienceProvider {
  id: string;
  label: string;
  getAudience(input: { handle?: string; projectId?: string }): Promise<AudienceSnapshot>;
}
