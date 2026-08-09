import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const storage = getStorage();
  const trash = new URL(req.url).searchParams.get("trash") === "1";
  const projects = trash ? await storage.listTrash() : await storage.listProjects();
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({ title: "" }));
  const { title, folderId } = body;
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A project needs a title." }, { status: 400 });
  }
  const project = await getStorage().createProject(title, typeof folderId === "string" ? folderId : null);
  return NextResponse.json(project, { status: 201 });
}
