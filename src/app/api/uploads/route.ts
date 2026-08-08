import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a file under the \"file\" field." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Only PNG, JPEG, WebP, or GIF images are supported." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Images must be under 10 MB." }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const url = await getStorage().saveFile(crypto.randomUUID(), bytes, file.type);
  return NextResponse.json({ url }, { status: 201 });
}
