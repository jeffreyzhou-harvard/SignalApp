import type { AccountProvider } from "./types";
import { xStubAccount } from "./x-stub";
import { isOAuthConfigured } from "./x-oauth";

/** Redirect-flow provider: linking happens in /api/auth/x/*, not via link(). */
const xOAuthAccount: AccountProvider = {
  id: "x-oauth",
  label: "X (OAuth)",
  mode: "redirect",
  startUrl: "/api/auth/x/start",
  async link() {
    throw new Error("This provider links through Sign in with X — use /api/auth/x/start.");
  },
};

const providers: Record<string, AccountProvider> = {
  [xStubAccount.id]: xStubAccount,
  [xOAuthAccount.id]: xOAuthAccount,
};

export function registerAccountProvider(p: AccountProvider) {
  providers[p.id] = p;
}

export function getAccountProvider(): AccountProvider {
  // Real OAuth turns on the moment X_OAUTH_CLIENT_ID is configured.
  const fallback = isOAuthConfigured() ? xOAuthAccount.id : xStubAccount.id;
  const id = process.env.ACCOUNT_PROVIDER || fallback;
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown account provider "${id}". Registered: ${Object.keys(providers).join(", ")}`);
  return provider;
}
