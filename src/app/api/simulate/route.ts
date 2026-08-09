import { NextResponse } from "next/server";
import { getAudienceProvider } from "@/lib/audience/registry";
import { getSimulationProvider } from "@/lib/simulation/registry";
import { getStorage } from "@/lib/storage";
import type { CampaignVariant } from "@/lib/simulation/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.projectId || !body?.clusterId || !Array.isArray(body.variants)) {
    return NextResponse.json({ error: "projectId, clusterId, and variants are required." }, { status: 400 });
  }
  const settings = await getStorage().getSettings();
  const audience = await getAudienceProvider().getAudience({
    handle: settings.xAccount?.handle,
    projectId: body.projectId,
  });
  if (!audience.clusters.some((c) => c.id === body.clusterId)) {
    return NextResponse.json({ error: "Unknown audience niche." }, { status: 400 });
  }
  try {
    const result = await getSimulationProvider().run({
      projectId: body.projectId,
      clusterId: body.clusterId,
      variants: body.variants as CampaignVariant[],
      audience,
      scope: body.scope === "all" ? "all" : "niche",
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Simulation failed." },
      { status: 502 }
    );
  }
}
