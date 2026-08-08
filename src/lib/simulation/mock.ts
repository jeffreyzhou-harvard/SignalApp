import type {
  SimAction,
  SimEvent,
  SimResult,
  SimSentiment,
  SimulationInput,
  SimulationProvider,
} from "./types";
import { applyEvent, emptyTally, engagementRate } from "./types";

/**
 * Seeded mock agent loop, following the stage demo's wind tunnel (demo/src/data/sim.ts):
 * a deterministic weighted event stream, target-tribe-heavy, where variant B
 * converts harder. Replace with a real persona-agent harness via the registry.
 */

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

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = <T,>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];

const REPLIES_B: Array<[string, SimSentiment]> = [
  ["ok this actually got me 👀", "pos"],
  ["the CTA is doing its job, take my money", "pos"],
  ["bookmarking for launch day", "pos"],
  ["this is the version. ship it", "pos"],
  ["waited for something like this, when's early access?", "pos"],
  ["does it work with what i already use?", "neu"],
  ["price point feels right", "pos"],
  ["my group chat needs to see this", "pos"],
];

const REPLIES_A: Array<[string, SimSentiment]> = [
  ["looks interesting, need more details", "neu"],
  ["is this real or a render", "neg"],
  ["ok this is clean", "pos"],
  ["how is this different from the usual?", "neg"],
  ["when does it ship?", "neu"],
];

const WEIGHTS: Record<"A" | "B", Array<[SimAction, number]>> = {
  A: [
    ["view", 62],
    ["like", 22],
    ["bookmark", 6],
    ["repost", 5],
    ["reply", 5],
  ],
  B: [
    ["view", 44],
    ["like", 28],
    ["bookmark", 11],
    ["repost", 9],
    ["reply", 8],
  ],
};

function weightedAction(rng: () => number, v: "A" | "B"): SimAction {
  const table = WEIGHTS[v];
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [a, w] of table) {
    r -= w;
    if (r <= 0) return a;
  }
  return "view";
}

const EVENT_COUNT = 170;

export const mockAgentSim: SimulationProvider = {
  id: "mock-agents",
  label: "Simulated agents (seeded)",

  async run({ projectId, clusterId, audience }: SimulationInput): Promise<SimResult> {
    const rng = mulberry32(hashSeed(`${projectId}:${clusterId}`));
    const targetMembers = audience.members.filter((m) => m.clusterId === clusterId);
    const pool = targetMembers.length > 0 ? targetMembers : audience.members;

    const events: SimEvent[] = [];
    let a = 0;
    let b = 0;
    for (let i = 0; i < EVENT_COUNT; i++) {
      // 70% target tribe, 30% spillover from the wider graph
      const member = rng() < 0.7 ? pick(rng, pool) : pick(rng, audience.members);
      const variant: "A" | "B" = rng() < 0.44 ? "A" : "B";
      const action = weightedAction(rng, variant);
      const ev: SimEvent = { memberId: member.id, variant, action };
      if (action === "reply") {
        const replies = variant === "B" ? REPLIES_B : REPLIES_A;
        const [reply, sentiment] = replies[(variant === "B" ? b++ : a++) % replies.length];
        ev.reply = reply;
        ev.sentiment = sentiment;
      }
      events.push(ev);
    }

    const final = { A: emptyTally(), B: emptyTally() };
    for (const e of events) final[e.variant] = applyEvent(final[e.variant], e);
    const erA = engagementRate(final.A);
    const erB = engagementRate(final.B);
    const winner = erB >= erA ? "B" : "A";
    const [hi, lo] = winner === "B" ? [erB, erA] : [erA, erB];
    const liftPct = lo > 0 ? Math.round(((hi - lo) / lo) * 100) : 100;

    const winTally = final[winner];
    const drivers = (
      [
        ["replies", winTally.replies],
        ["bookmarks", winTally.bookmarks],
        ["reposts", winTally.reposts],
        ["likes", winTally.likes],
      ] as Array<[string, number]>
    )
      .sort((x, y) => y[1] - x[1])
      .slice(0, 2)
      .map(([name]) => name);

    return {
      events,
      final,
      engagement: { A: Number(erA.toFixed(1)), B: Number(erB.toFixed(1)) },
      verdict: {
        winner,
        liftPct,
        confidencePct: 90 + Math.floor(rng() * 8),
        driver: drivers.join(" & "),
      },
      provider: mockAgentSim.id,
      agentCount: pool.length + Math.round(audience.members.length * 0.3),
    };
  },
};
