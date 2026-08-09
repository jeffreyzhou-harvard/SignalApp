import { NextResponse } from "next/server";
import { getAudienceProvider } from "@/lib/audience/registry";
import { resolveAudienceHandle } from "@/lib/audience/resolve";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const projectId = params.get("projectId") ?? undefined;
  const settings = await getStorage().getSettings();
  const snapshot = await getAudienceProvider().getAudience({
    // demo override from Settings wins; then the caller's handle; then the linked account
    // explicit per-project handle wins; the settings picker covers the rest
    handle: resolveAudienceHandle(settings, params.get("handle")),
    projectId,
  });
  return NextResponse.json(snapshot);
}
