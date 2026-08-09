import type { AudienceProvider } from "./types";
import { mockAudience } from "./mock";
import { dbAudience } from "./db";

const providers: Record<string, AudienceProvider> = {
  [mockAudience.id]: mockAudience,
  [dbAudience.id]: dbAudience,
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
