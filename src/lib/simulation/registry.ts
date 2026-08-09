import type { SimulationProvider } from "./types";
import { mockAgentSim } from "./mock";

const providers: Record<string, SimulationProvider> = {
  [mockAgentSim.id]: mockAgentSim,
};

/** Register a real agent harness here (persona agents over niche embeddings). */
export function registerSimulationProvider(p: SimulationProvider) {
  providers[p.id] = p;
}

export function getSimulationProvider(): SimulationProvider {
  const id = process.env.SIMULATION_PROVIDER ?? mockAgentSim.id;
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown simulation provider "${id}". Registered: ${Object.keys(providers).join(", ")}`);
  return provider;
}
