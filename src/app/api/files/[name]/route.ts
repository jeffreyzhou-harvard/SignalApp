import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import { parseRangeHeader } from "@/lib/http/range";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = await getStorage().readFile(name);
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const bytes = new Uint8Array(file.bytes);
  const baseHeaders = {
    "Content-Type": file.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    // Safari refuses to play <video> from endpoints that don't honor byte
    // ranges, so partial responses here are load-bearing, not an optimization.
    "Accept-Ranges": "bytes",
  };

  const range = parseRangeHeader(req.headers.get("range"), bytes.length);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${bytes.length}` },
    });
  }
  if (range) {
    return new Response(bytes.slice(range.start, range.end + 1), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${bytes.length}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }
  return new Response(bytes, {
    headers: { ...baseHeaders, "Content-Length": String(bytes.length) },
  });
}
