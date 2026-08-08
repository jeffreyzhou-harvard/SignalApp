import type { AudienceProvider } from "./types";
import { mockAudience } from "./mock";

const providers: Record<string, AudienceProvider> = {
  [mockAudience.id]: mockAudience,
};

/** Register the real clustering pipeline here when it lands. */
export function registerAudienceProvider(p: AudienceProvider) {
  providers[p.id] = p;
}

export function getAudienceProvider(): AudienceProvider {
  const id = process.env.AUDIENCE_PROVIDER ?? mockAudience.id;
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown audience provider "${id}". Registered: ${Object.keys(providers).join(", ")}`);
  return provider;
}
