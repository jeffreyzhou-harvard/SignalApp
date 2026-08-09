import { NextResponse } from "next/server";
import { getAudienceProvider } from "@/lib/audience/registry";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const projectId = params.get("projectId") ?? undefined;
  const settings = await getStorage().getSettings();
  const snapshot = await getAudienceProvider().getAudience({
    // demo override from Settings wins; then the caller's handle; then the linked account
    handle: settings.audienceHandle ?? params.get("handle") ?? settings.xAccount?.handle,
    projectId,
  });
  return NextResponse.json(snapshot);
}
