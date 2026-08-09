import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/accounts/x-oauth";
import { LINK_COOKIE, LINK_COOKIE_MAX_AGE, sealAccount } from "@/lib/accounts/link-cookie";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = jar.get("x_oauth")?.value;

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/dashboard?xauth=${encodeURIComponent(reason)}`, url.origin));

  if (!raw) return fail("expired");
  let stashed: { v: string; s: string; r: string };
  try {
    stashed = JSON.parse(raw);
  } catch {
    return fail("expired");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return fail("denied");
  if (!code || !state || state !== stashed.s) return fail("state_mismatch");

  let account;
  try {
    account = await exchangeCode({ code, verifier: stashed.v, origin: url.origin });
  } catch (err) {
    return fail(err instanceof Error ? err.message.slice(0, 120) : "exchange_failed");
  }

  // Durable write where the filesystem allows it (local dev). Serverless hosts
  // throw here (read-only fs) — the sealed cookie below carries the link there.
  try {
    const storage = getStorage();
    const settings = await storage.getSettings();
    settings.xAccount = account;
    await storage.putSettings(settings);
  } catch {}

  const res = NextResponse.redirect(new URL(stashed.r || "/dashboard", url.origin));
  res.cookies.delete("x_oauth");
  const sealed = sealAccount(account);
  if (sealed) {
    res.cookies.set(LINK_COOKIE, sealed, {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: LINK_COOKIE_MAX_AGE,
    });
  }
  return res;
}
