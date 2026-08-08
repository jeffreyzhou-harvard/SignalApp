import { NextResponse } from "next/server";
import { getAudienceProvider } from "@/lib/audience/registry";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;
  const settings = await getStorage().getSettings();
  const snapshot = await getAudienceProvider().getAudience({
    handle: settings.xAccount?.handle,
    projectId,
  });
  return NextResponse.json(snapshot);
}
