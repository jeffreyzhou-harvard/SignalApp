import { NextRequest, NextResponse } from "next/server";

/**
 * Private-beta lock. With BETA_LOCK=1 (set it on the public deployment), only
 * the landing page and the waitlist are reachable: app pages redirect to the
 * waitlist and API routes answer 403. Unset locally, so dev stays open.
 */
// /explore is public by design: a read-only tour of the demo audience maps,
// served by /api/explore (allowlisted handles only, no viewer data).
const OPEN_PATHS = new Set(["/", "/waitlist", "/explore", "/api/explore"]);

export function middleware(req: NextRequest) {
  if (process.env.BETA_LOCK !== "1") return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (OPEN_PATHS.has(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Signal is in private beta." }, { status: 403 });
  }
  return NextResponse.redirect(new URL("/waitlist", req.url));
}

export const config = {
  // Everything except Next internals and static assets (paths with a dot).
  matcher: ["/((?!_next|.*\\..*).*)"],
};
