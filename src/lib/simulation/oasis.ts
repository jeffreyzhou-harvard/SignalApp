import type { SimEvent, SimResult, SimulationInput, SimulationProvider } from "./types";
import { mockAgentSim } from "./mock";

/**
 * Real wind tunnel on OASIS (camel-ai): every audience member becomes an LLM
 * agent (Grok) with their real bio as its persona; agents like/repost/reply to
 * the A and B posts as themselves. Runs in the simlab sidecar service
 * (simlab/: uv run uvicorn app:app --port 8100). Scope picks who reacts: the
 * targeted niche or a sample of the whole demographic. Falls back to the
 * seeded mock when the service is unreachable, so the panel never breaks.
 */

const SIMLAB_URL = process.env.SIMLAB_URL ?? "http://localhost:8100";
const MAX_AGENTS = Number(process.env.SIMLAB_MAX_AGENTS ?? 24);
const TIMESTEPS = Number(process.env.SIMLAB_TIMESTEPS ?? 2);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const oasisSim: SimulationProvider = {
  id: "oasis",
  label: "OASIS agents (Grok)",

  async run(input: SimulationInput): Promise<SimResult> {
    const scope = input.scope ?? "niche";
    const pool =
      scope === "all"
        ? input.audience.members
        : input.audience.members.filter((m) => m.clusterId === input.clusterId);
    const source = pool.length > 0 ? pool : input.audience.members;

    // Deterministic sample up to the agent cap (LLM cost control).
    const sampled = [...source]
      .sort((a, b) => hash(`${input.projectId}:${a.handle}`) - hash(`${input.projectId}:${b.handle}`))
      .slice(0, MAX_AGENTS);

    try {
      const res = await fetch(`${SIMLAB_URL}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variants: input.variants.map((v) => ({ id: v.id, copy: v.copy })),
          members: sampled.map((m) => ({ id: m.id, name: m.name, handle: m.handle, bio: m.bio })),
          timesteps: TIMESTEPS,
        }),
        // OASIS runs real agent turns; give it room.
        signal: AbortSignal.timeout(290_000),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`simlab ${res.status}: ${detail.slice(0, 200)}`);
      }
      const json = await res.json();
      const events: SimEvent[] = (json.events ?? []).map(
        (e: { memberId: number; variant: "A" | "B"; action: string; reply?: string }) => ({
          memberId: e.memberId,
          variant: e.variant,
          action: e.action as SimEvent["action"],
          ...(e.reply ? { reply: e.reply } : {}),
        })
      );
      return {
        events,
        final: json.final,
        engagement: json.engagement,
        verdict: json.verdict,
        provider: json.provider ?? "oasis",
        agentCount: json.agentCount ?? sampled.length,
      };
    } catch {
      // Sidecar down or timed out: the seeded mock keeps the demo alive.
      return mockAgentSim.run(input);
    }
  },
};
