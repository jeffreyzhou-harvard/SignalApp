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
    profile: { name: settings.profile?.name ?? null },
    defaults: {
      style: settings.defaults?.style ?? "none",
      resolution: settings.defaults?.resolution ?? "1k",
    },
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

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    settings.profile = { name: name || null };
  }

  if ("defaults" in body && body.defaults && typeof body.defaults === "object") {
    settings.defaults = {
      style: typeof body.defaults.style === "string" ? body.defaults.style : (settings.defaults?.style ?? "none"),
      resolution: body.defaults.resolution === "2k" ? "2k" : "1k",
    };
  }

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
