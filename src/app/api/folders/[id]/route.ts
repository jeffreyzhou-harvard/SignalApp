import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const { name } = await req.json().catch(() => ({}));
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "A folder needs a name." }, { status: 400 });
  }
  const folder = await getStorage().renameFolder(id, name);
  if (!folder) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  return NextResponse.json(folder);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await getStorage().deleteFolder(id);
  return NextResponse.json({ ok: true });
}
