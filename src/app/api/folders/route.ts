import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getStorage().listFolders());
}

export async function POST(req: Request) {
  const { name } = await req.json().catch(() => ({ name: "" }));
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "A folder needs a name." }, { status: 400 });
  }
  const folder = await getStorage().createFolder(name);
  return NextResponse.json(folder, { status: 201 });
}
