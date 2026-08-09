import { NextResponse } from "next/server";
import { getAudienceProvider } from "@/lib/audience/registry";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const projectId = params.get("projectId") ?? undefined;
  const settings = await getStorage().getSettings();
  const snapshot = await getAudienceProvider().getAudience({
    // per-project handle wins over the workspace's connected account
    handle: params.get("handle") ?? settings.xAccount?.handle,
    projectId,
  });
  return NextResponse.json(snapshot);
}
