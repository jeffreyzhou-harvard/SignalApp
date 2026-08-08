import type { AccountProvider } from "./types";
import { xStubAccount } from "./x-stub";

const providers: Record<string, AccountProvider> = {
  [xStubAccount.id]: xStubAccount,
};

export function registerAccountProvider(p: AccountProvider) {
  providers[p.id] = p;
}

export function getAccountProvider(): AccountProvider {
  const id = process.env.ACCOUNT_PROVIDER ?? xStubAccount.id;
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown account provider "${id}". Registered: ${Object.keys(providers).join(", ")}`);
  return provider;
}
