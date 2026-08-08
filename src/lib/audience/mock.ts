import type { AudienceCluster, AudienceMember, AudienceProvider, AudienceSnapshot } from "./types";

/**
 * Seeded mock audience — same tribes and generator approach as the stage demo
 * (demo/src/data), kept deterministic so the galaxy lays out identically every
 * run. Swap for the real clustering pipeline via the audience registry.
 */

// mulberry32 — tiny seeded PRNG
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

function gaussian(rng: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const TOTAL_FOLLOWERS = 18442;

interface MockCluster extends AudienceCluster {
  nodes: number;
}

const CLUSTERS: MockCluster[] = [
  {
    id: "ai-builders",
    label: "AI Builders & Engineers",
    members: 5214,
    nodes: 104,
    color: "#8b7cff",
    blurb: "Ship-post energy. Bookmark deep technical breakdowns, reply with benchmarks.",
    center: [-14, 2.5, -6],
  },
  {
    id: "students",
    label: "Students & EdTech",
    members: 4388,
    nodes: 88,
    color: "#2fd6f6",
    blurb: "CS + pre-med undergrads. Most active weeknights 9pm–1am. Respond to price + relatability.",
    center: [13.5, -1.5, 4],
  },
  {
    id: "robotics",
    label: "Robotics & Hardware",
    members: 3109,
    nodes: 62,
    color: "#ffb02e",
    blurb: "Teardown people. Want specs, actuators, BOM cost. Suspicious of renders.",
    center: [-2, 5.5, 12],
  },
  {
    id: "design",
    label: "Design & Creative Tools",
    members: 2347,
    nodes: 47,
    color: "#ff7ac6",
    blurb: "Judge the poster before the product. Repost beautiful launches.",
    center: [4, -5.5, -13],
  },
  {
    id: "founders",
    label: "Founders & VC",
    members: 1942,
    nodes: 39,
    color: "#3ee6a0",
    blurb: "Skim for traction. Reply with distribution questions. Quote-post hot takes.",
    center: [-9, -4, 9],
  },
  {
    id: "productivity",
    label: "Productivity & Study Gurus",
    members: 1442,
    nodes: 29,
    color: "#6aa6ff",
    blurb: "Thread-makers. Will turn your product into a listicle within 48h.",
    center: [11, 5, -8],
  },
];

const FIRST = [
  "Maya", "Priya", "Jordan", "Sam", "Alex", "Noah", "Ava", "Liam", "Zoe", "Ethan",
  "Aisha", "Diego", "Hana", "Marcus", "Nina", "Omar", "Lena", "Kai", "Tara", "Ryan",
  "Sofia", "Devon", "Ivy", "Jonas", "Mira", "Cole", "Anya", "Felix", "Ruth", "Theo",
  "Grace", "Hugo", "Isla", "Mateo", "Nadia", "Owen", "Pia", "Quinn", "Rosa", "Sean",
] as const;

const LAST = [
  "Chen", "Patel", "Kim", "Nguyen", "Garcia", "Okafor", "Silva", "Novak", "Haddad", "Ito",
  "Murphy", "Kaur", "Alvarez", "Bauer", "Costa", "Dube", "Eriksen", "Fischer", "Gao", "Hertz",
  "Iyer", "Jensen", "Khan", "Lopez", "Mehta", "Nakamura", "Osei", "Park", "Quispe", "Rossi",
] as const;

const HANDLE_SUFFIX: Record<string, readonly string[]> = {
  "ai-builders": ["builds", "ml", "dev", "ai", "ships", "infra", "stack"],
  students: ["studies", "cs26", "cs27", "premed", "notes", "uni", "gradszn"],
  robotics: ["bots", "hw", "servo", "mech", "solder", "pcb"],
  design: ["design", "ui", "type", "studio", "pixels"],
  founders: ["vc", "angel", "founder", "capital", "growth"],
  productivity: ["focus", "method", "systems", "deepwork", "habits"],
};

const BIOS: Record<string, readonly string[]> = {
  "ai-builders": [
    "building agents at a startup you haven't heard of yet",
    "ml eng · evals are all you need",
    "shipping llm infra · ex-faang",
    "weights, biases, and opinions",
  ],
  students: [
    "cs @ berkeley · 27",
    "pre-med, running on caffeine and anki",
    "ee sophomore · building things between psets",
    "double major, single braincell during finals",
  ],
  robotics: [
    "robots by day, robots by night",
    "actuators > everything · FRC alum",
    "hardware is hard, that's the point",
    "i void warranties",
  ],
  design: [
    "product designer · typography apologist",
    "making software feel like something",
    "design systems + espresso",
    'portfolio perpetually "almost done"',
  ],
  founders: [
    "founder · 2x exited (1 to my cofounder)",
    "seed investor · dm me your deck",
    "building in public, fundraising in private",
    "operator turned angel",
  ],
  productivity: [
    "i turn chaos into checklists",
    "notion templates paid my rent",
    "deep work evangelist · newsletter below",
    "your favorite study youtuber's favorite poster",
  ],
};

function buildMembers(): AudienceMember[] {
  const rng = mulberry32(20260808);
  const avatarIdx = Array.from({ length: 400 }, (_, i) => i % 200);
  for (let i = avatarIdx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [avatarIdx[i], avatarIdx[j]] = [avatarIdx[j], avatarIdx[i]];
  }
  const all: AudienceMember[] = [];
  for (const cluster of CLUSTERS) {
    for (let i = 0; i < cluster.nodes; i++) {
      const first = pick(rng, FIRST);
      const last = pick(rng, LAST);
      const suffix = pick(rng, HANDLE_SUFFIX[cluster.id]);
      const n = Math.floor(rng() * 90);
      const a = avatarIdx.pop() ?? Math.floor(rng() * 100);
      const gender = a % 2 === 0 ? "m" : "f";
      all.push({
        id: all.length,
        name: `${first} ${last}`,
        handle: `@${first.toLowerCase()}${rng() > 0.5 ? "_" : ""}${suffix}${n < 30 ? n : ""}`,
        bio: pick(rng, BIOS[cluster.id]),
        avatar: `/avatars/${gender}${Math.floor(a / 2)}.jpg`,
        clusterId: cluster.id,
        pos: [
          cluster.center[0] + gaussian(rng) * 3.4,
          cluster.center[1] + gaussian(rng) * 2.0,
          cluster.center[2] + gaussian(rng) * 3.4,
        ],
      });
    }
  }
  return all;
}

const SNAPSHOT: AudienceSnapshot = {
  totalFollowers: TOTAL_FOLLOWERS,
  clusters: CLUSTERS.map(({ nodes: _nodes, ...c }) => c),
  members: buildMembers(),
  source: "mock",
  synthetic: true,
};

export const mockAudience: AudienceProvider = {
  id: "mock",
  label: "Sample audience",
  async getAudience() {
    return SNAPSHOT;
  },
};
