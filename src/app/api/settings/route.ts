import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { getAccountProvider } from "@/lib/accounts/registry";

export const runtime = "nodejs";

export async function GET() {
  const settings = await getStorage().getSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const storage = getStorage();
  const settings = await storage.getSettings();

  if ("xHandle" in body) {
    if (body.xHandle === null) {
      settings.xAccount = null;
    } else if (typeof body.xHandle === "string") {
      try {
        settings.xAccount = await getAccountProvider().link({ handle: body.xHandle });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Could not link account." },
          { status: 400 }
        );
      }
    }
  }

  await storage.putSettings(settings);
  return NextResponse.json(settings);
}
