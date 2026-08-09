// Client-side tool handlers. Every handler returns a JSON string (the realtime
// API's function_call_output). Plug-and-play: add a key here + declare it in
// session.ts — nothing else changes.

export interface ToolContext {
  projectId?: string;
}

type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

/** Kept so edit_image can default to "the latest generation" like a human would. */
let lastImageUrl: string | undefined;

async function callApi(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `${path} → ${res.status}`, detail: json };
  return json;
}

const handlers: Record<string, Handler> = {
  async focus_cluster(args) {
    const clusterId = String(args.cluster_id ?? "");
    window.dispatchEvent(new CustomEvent("agentsim:focus-cluster", { detail: { clusterId } }));
    return { ok: true, focused: clusterId };
  },

  async generate_image(args, ctx) {
    const out = (await callApi("/api/imagine", {
      kind: "image",
      prompt: args.prompt,
      aspectRatio: args.aspect_ratio,
      projectId: ctx.projectId,
    })) as { url?: string };
    if (out.url) lastImageUrl = out.url;
    return out;
  },

  async edit_image(args, ctx) {
    const out = (await callApi("/api/imagine", {
      kind: "edit",
      prompt: args.prompt,
      imageUrl: args.image_url ?? lastImageUrl,
      projectId: ctx.projectId,
    })) as { url?: string };
    if (out.url) lastImageUrl = out.url;
    return out;
  },

  async generate_video(args, ctx) {
    return callApi("/api/imagine", {
      kind: "video",
      prompt: args.prompt,
      imageUrl: args.image_url ?? lastImageUrl,
      duration: args.duration_seconds,
      projectId: ctx.projectId,
    });
  },

  async post_to_x(args) {
    const text = String(args.text ?? "");
    const draft = { text, mediaUrl: (args.media_url as string) ?? lastImageUrl ?? null };
    // Draft-first safety lives here: no network call until the founder has
    // explicitly confirmed. Publishing goes through the team's real path
    // (/api/publish: linked OAuth account, token refresh, 280-char check).
    if (args.confirm !== true) {
      return {
        posted: false,
        draft,
        note: "Draft preview. Call again with confirm=true after the founder explicitly approves.",
      };
    }
    return callApi("/api/publish", { text });
  },
};

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  try {
    const handler = handlers[name];
    if (!handler) return JSON.stringify({ error: `unknown tool "${name}"` });
    return JSON.stringify(await handler(args, ctx));
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}
