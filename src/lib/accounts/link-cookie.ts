import crypto from "crypto";
import type { LinkedXAccount } from "../types";

/**
 * Encrypted cookie fallback for the linked X account. On hosts with an
 * ephemeral filesystem (Vercel) the json storage adapter can't persist the
 * OAuth link, so the callback also seals the account into an httpOnly cookie
 * and the read paths fall back to it. AES-256-GCM keyed off the OAuth client
 * secret; tokens never reach the browser in readable form.
 */

export const LINK_COOKIE = "x_link";
export const LINK_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // ~6 months, matches refresh-token life

function key(): Buffer | null {
  const secret =
    process.env.LINK_COOKIE_SECRET || process.env.X_OAUTH_CLIENT_SECRET || process.env.X_OAUTH_CLIENT_ID;
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

export function sealAccount(account: LinkedXAccount): string | null {
  const k = key();
  if (!k) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(account), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unsealAccount(value: string | undefined): LinkedXAccount | null {
  if (!value) return null;
  const k = key();
  if (!k) return null;
  try {
    const buf = Buffer.from(value, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const body = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    const account = JSON.parse(json) as LinkedXAccount;
    return account?.handle ? account : null;
  } catch {
    return null;
  }
}
