import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/** Available audience maps (ingested seed accounts) for the Settings picker. */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/audiences`, { cache: "no-store" });
    if (!res.ok) throw new Error(`backend ${res.status}`);
    const rows: { seed_handle: string | null; personas: number; has_clusters: boolean }[] =
      await res.json();
    return NextResponse.json(
      rows
        .filter((r) => r.seed_handle && r.has_clusters)
        .map((r) => ({ handle: r.seed_handle!.replace(/^@/, ""), personas: r.personas }))
    );
  } catch {
    // Backend down or sample mode: no alternate maps to offer.
    return NextResponse.json([]);
  }
}
