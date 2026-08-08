import crypto from "crypto";
import type { LinkedXAccount } from "../types";
import { getStorage } from "../storage";

/**
 * X OAuth 2.0 with PKCE — the real "Sign in with X" path. Activates
 * automatically when X_OAUTH_CLIENT_ID is set (portal: User authentication
 * settings, type Web App, callback = <origin>/api/auth/x/callback).
 *
 * Flow: /api/auth/x/start builds the authorize URL and stashes the PKCE
 * verifier + state in a cookie → X redirects back to /api/auth/x/callback →
 * we exchange the code, fetch the user, and store tokens per-user via the
 * storage adapter. offline.access gives a refresh token so reconnection is
 * invisible; getXAccessToken() below refreshes transparently for whoever
 * needs to call the X API on the user's behalf (e.g. posting the winner).
 */

const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const ME_URL = "https://api.x.com/2/users/me";

export const X_SCOPES = ["users.read", "tweet.read", "follows.read", "like.read", "tweet.write", "offline.access"];

export function isOAuthConfigured(): boolean {
  return !!process.env.X_OAUTH_CLIENT_ID;
}

function clientId(): string {
  const id = process.env.X_OAUTH_CLIENT_ID;
  if (!id) throw new Error("X_OAUTH_CLIENT_ID is not set.");
  return id;
}

/** Confidential clients also send Basic auth on token calls; public clients don't. */
function tokenAuthHeaders(): Record<string, string> {
  const secret = process.env.X_OAUTH_CLIENT_SECRET;
  const base: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (secret) {
    base.Authorization = `Basic ${Buffer.from(`${clientId()}:${secret}`).toString("base64")}`;
  }
  return base;
}

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function createPkce() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

export function redirectUri(origin: string): string {
  return process.env.X_OAUTH_REDIRECT_URI ?? `${origin}/api/auth/x/callback`;
}

export function buildAuthorizeUrl(input: { origin: string; challenge: string; state: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: redirectUri(input.origin),
    scope: X_SCOPES.join(" "),
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: tokenAuthHeaders(), body });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`X token endpoint error ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export async function exchangeCode(input: { code: string; verifier: string; origin: string }): Promise<LinkedXAccount> {
  const token = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: redirectUri(input.origin),
      code_verifier: input.verifier,
      client_id: clientId(),
    })
  );

  const meRes = await fetch(ME_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!meRes.ok) throw new Error(`Could not load your X profile (${meRes.status}).`);
  const me = await meRes.json();

  return {
    handle: me.data?.username ?? "unknown",
    userId: me.data?.id,
    linkedAt: new Date().toISOString(),
    provider: "x-oauth",
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope,
  };
}

/**
 * Returns a valid access token for the linked account, refreshing (and
 * persisting) it when it's within a minute of expiry. The seam collaborators
 * call when publishing from the user's account.
 */
export async function getXAccessToken(): Promise<string | null> {
  const storage = getStorage();
  const settings = await storage.getSettings();
  const account = settings.xAccount;
  if (!account?.accessToken) return null;

  if (account.expiresAt && account.expiresAt - Date.now() > 60_000) {
    return account.accessToken;
  }
  if (!account.refreshToken) return account.accessToken;

  const token = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
      client_id: clientId(),
    })
  );
  settings.xAccount = {
    ...account,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? account.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  await storage.putSettings(settings);
  return token.access_token;
}
