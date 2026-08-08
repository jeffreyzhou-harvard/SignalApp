/**
 * Pluggable audience data. The mock adapter ships seeded demo tribes; the real
 * pipeline (X ingest → persona docs → embed → cluster, see docs/ARCHITECTURE.md)
 * implements this same interface later — the galaxy UI never changes.
 */

export interface AudienceCluster {
  id: string;
  label: string;
  /** Real audience size this tribe represents. */
  members: number;
  /** Categorical data color for nodes/edges/labels. */
  color: string;
  blurb: string;
  /** Hand-tuned (or layout-computed) 3D centroid. */
  center: [number, number, number];
}

export interface AudienceMember {
  id: number;
  name: string;
  handle: string;
  bio: string;
  avatar: string;
  clusterId: string;
  pos: [number, number, number];
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
