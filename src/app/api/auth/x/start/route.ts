import { NextResponse } from "next/server";
import { buildAuthorizeUrl, createPkce, isOAuthConfigured } from "@/lib/accounts/x-oauth";

export const runtime = "nodejs";

/**
 * Kicks off Sign in with X. Without OAuth configured (no X_OAUTH_CLIENT_ID)
 * it degrades gracefully: straight to the destination, where the local stub
 * link flow in Settings still works.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/dashboard";
  const safeReturn = returnTo.startsWith("/") ? returnTo : "/dashboard";

  if (!isOAuthConfigured()) {
    return NextResponse.redirect(new URL(safeReturn, url.origin));
  }

  const { verifier, challenge, state } = createPkce();
  const res = NextResponse.redirect(buildAuthorizeUrl({ origin: url.origin, challenge, state }));
  res.cookies.set("x_oauth", JSON.stringify({ v: verifier, s: state, r: safeReturn }), {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 600,
  });
  return res;
}
