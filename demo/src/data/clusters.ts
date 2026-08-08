export interface Cluster {
  id: string
  label: string
  members: number // real audience size this tribe represents
  nodes: number // how many we render in the sampled galaxy
  color: string
  blurb: string
  center: [number, number, number]
}

export const TOTAL_FOLLOWERS = 18442

// Six tribes, HDBSCAN-labelled by Grok (simulated). Node counts are the
// rendered sample (~2% of the real audience), proportional to `members`.
export const CLUSTERS: Cluster[] = [
  {
    id: 'ai-builders',
    label: 'AI Builders & Engineers',
    members: 5214,
    nodes: 104,
    color: '#8b7cff',
    blurb: 'Ship-post energy. Bookmark deep technical breakdowns, reply with benchmarks.',
    center: [-14, 2.5, -6],
  },
  {
    id: 'students',
    label: 'Students & EdTech',
    members: 4388,
    nodes: 88,
    color: '#2fd6f6',
    blurb: 'CS + pre-med undergrads. Most active weeknights 9pm–1am. Respond to price + relatability.',
    center: [13.5, -1.5, 4],
  },
  {
    id: 'robotics',
    label: 'Robotics & Hardware',
    members: 3109,
    nodes: 62,
    color: '#ffb02e',
    blurb: 'Teardown people. Want specs, actuators, BOM cost. Suspicious of renders.',
    center: [-2, 5.5, 12],
  },
  {
    id: 'design',
    label: 'Design & Creative Tools',
    members: 2347,
    nodes: 47,
    color: '#ff7ac6',
    blurb: 'Judge the poster before the product. Repost beautiful launches.',
    center: [4, -5.5, -13],
  },
  {
    id: 'founders',
    label: 'Founders & VC',
    members: 1942,
    nodes: 39,
    color: '#3ee6a0',
    blurb: 'Skim for traction. Reply with distribution questions. Quote-post hot takes.',
    center: [-9, -4, 9],
  },
  {
    id: 'productivity',
    label: 'Productivity & Study Gurus',
    members: 1442,
    nodes: 29,
    color: '#6aa6ff',
    blurb: 'Thread-makers. Will turn your product into a listicle within 48h.',
    center: [11, 5, -8],
  },
]

export const STUDENTS = CLUSTERS[1]
