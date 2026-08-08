import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const project = await getStorage().getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const patch = await req.json().catch(() => ({}));
  const project = await getStorage().updateProject(id, {
    ...(typeof patch.title === "string" ? { title: patch.title } : {}),
    ...(typeof patch.thumbnail === "string" || patch.thumbnail === null ? { thumbnail: patch.thumbnail } : {}),
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(project);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await getStorage().deleteProject(id);
  return NextResponse.json({ ok: true });
}
