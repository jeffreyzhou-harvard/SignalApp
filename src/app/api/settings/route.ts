import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { getAccountProvider } from "@/lib/accounts/registry";
import type { AppSettings, PublicSettings } from "@/lib/types";

export const runtime = "nodejs";

/** Tokens never leave the server — responses carry only the public shape. */
function toPublic(settings: AppSettings): PublicSettings {
  const provider = getAccountProvider();
  return {
    xAccount: settings.xAccount
      ? {
          handle: settings.xAccount.handle,
          linkedAt: settings.xAccount.linkedAt,
          provider: settings.xAccount.provider,
        }
      : null,
    auth: {
      provider: provider.id,
      mode: provider.mode,
      startUrl: provider.startUrl,
    },
  };
}

export async function GET() {
  const settings = await getStorage().getSettings();
  return NextResponse.json(toPublic(settings));
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const storage = getStorage();
  const settings = await storage.getSettings();

  if ("xHandle" in body) {
    if (body.xHandle === null) {
      settings.xAccount = null;
    } else if (typeof body.xHandle === "string") {
      const provider = getAccountProvider();
      if (provider.mode === "redirect") {
        return NextResponse.json(
          { error: "This workspace links through Sign in with X." },
          { status: 400 }
        );
      }
      try {
        settings.xAccount = await provider.link({ handle: body.xHandle });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Could not link account." },
          { status: 400 }
        );
      }
    }
  }

  await storage.putSettings(settings);
  return NextResponse.json(toPublic(settings));
}
