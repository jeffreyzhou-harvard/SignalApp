# Base Voice Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A minimal, modular voice+text agent harness on the Grok Voice Agent API (speech-to-speech WebSocket) that drives the existing AgentSim UI — zoom the galaxy, generate Imagine creative, draft/post to X — with every tool plug-and-play behind one session config.

**Architecture:** The browser holds ONE realtime WebSocket to `wss://api.x.ai/v1/realtime` (ephemeral token; no custom STT/agent loop — voice AND text ride the same session). Tools come in three flavors, all declared in a single server-built session payload: (1) **remote MCP** entries executed server-side by xAI (the teammates' pgvector-on-Neon MCP plugs in as just a `server_url`), (2) **client-executed function tools** dispatched by a tiny registry — UI commands (`focus_cluster`) mutate the galaxy, generation tools fetch our existing Next.js API routes so keys stay server-side, and (3) xAI **built-ins** (`x_search`). Grok Build is the *dev* harness: same MCP config + an imagine-poster skill for conversational tool testing.

**Tech Stack:** Next.js 15 (existing app), Web Audio API (mic + playback), xAI Voice Agent API, existing `src/lib/providers/grok.ts` Imagine providers, vitest for pure-logic tests, Grok Build (`grok` CLI) for the dev loop.

## Global Constraints

- **Do this, nothing more** — no cluster-query MCP of our own (teammates own it; we consume `AUDIENCE_MCP_URL`), no bidirectional graph state sync (agent → UI commands only), X posting optional and draft-first.
- **Modular / plug-and-play** — new tools = one entry in `session.ts` + one handler in `tools.ts`. No other file changes.
- **Works out of the box** — every external dependency degrades: no `AUDIENCE_MCP_URL` → tool omitted, agent still knows the tribe catalog from instructions; no mic permission → text input still works.
- **Repo rules** (CLAUDE.md): commits authored by the user only; config over hardcoding; one responsibility per module; core logic must not import I/O.
- **Verified API surface** (2026-08-08, docs.x.ai): WS `wss://api.x.ai/v1/realtime?model=grok-voice-latest`; browser auth via WebSocket subprotocol `xai-client-secret.<token>`; mint `POST /v1/realtime/client_secrets` `{"expires_after":{"seconds":300}}` (does NOT accept a `session` field); MCP tool entry `{type:"mcp", server_url, server_label, allowed_tools?, authorization?}` (Streaming HTTP/SSE only, executed server-side); function tool calls arrive as `response.function_call_arguments.done` and return via `conversation.item.create` `{type:"function_call_output", call_id, output}`; text input = `conversation.item.create` (`input_text`) + `response.create`; audio PCM 24 kHz base64 via `input_audio_buffer.append` / `response.output_audio.delta`.

## Decisions locked (answers to open questions in the spec)

- **Do we need built-in `web_search`/`x_search`?** The embeddings DB only knows *your followers*. `x_search` knows *live X* — what competitors posted today, trending hooks at draft time. It executes server-side at xAI, costs one line of config, and gives the demo a "what's working on X right now?" beat. **Enable `x_search`; skip `web_search`** (adds latency + nondeterminism for no demo value).
- **Ephemeral token can't carry session config**, so the client sends `session.update` — but the payload is *assembled server-side* and returned by the token route. Single source of truth stays on the server; the MCP `authorization` header never ships in the static bundle (it is visible to the logged-in user in that one response — fine for a read-only demo store; revisit before prod).
- **Imagine = function tools hitting our existing providers**, not a community MCP: `src/lib/providers/grok.ts` already implements `images/generations`, `images/edits`, `videos/generations` + polling. A community MCP would duplicate that and hide the results from our UI panels.
- **UI commands are just function tools.** `focus_cluster` is declared like any tool; the browser executes it by dispatching a DOM `CustomEvent` the galaxy listens for. No state-sync layer.
- **One brain, two equal inputs.** The app's UI offers BOTH voice and text chat for the harness — they are the same session, not two systems. Typing sends `conversation.item.create` over the same WebSocket the mic streams into; the copilot's replies always render as text captions and (in voice mode) speak. Text is a first-class mode, not a mic-failure fallback.
- **Campaign routes coexist, don't collide** (post-`9abe155`): `/api/campaign/baseline` and `/api/campaign/tailor` are the button-driven campaign flow. The harness doesn't call them in v1 — but the registry makes `tailor_to_tribe` (→ POST `/api/campaign/tailor`) a two-line future tool if we want the copilot to drive that flow by voice.

## File structure

```
src/lib/voice/
  session.ts       # pure: builds the session.update payload (instructions + tools)  [tested]
  pcm.ts           # pure: Float32↔Int16↔base64 audio conversion                     [tested]
  tools.ts         # client tool registry: name → async handler                      [tested]
  client.ts        # RealtimeClient: WS lifecycle, mic, playback, events (I/O glue)
src/app/api/voice/token/route.ts   # mints ephemeral token + returns session payload
src/app/api/imagine/route.ts       # tool-shaped wrapper over existing providers
src/app/api/x/post/route.ts        # OPTIONAL: draft-first posting
src/components/VoiceDock.tsx       # Siri-like orb + voice/text toggle
src/components/galaxy/GalaxyView.tsx  # MODIFY: listen for agentsim:focus-cluster
src/components/chat/ChatRoom.tsx      # MODIFY: mount <VoiceDock projectId={...}/>
.mcp.json                          # dev-harness MCP config (Grok Build + Claude Code)
.grok/skills/imagine-poster/SKILL.md  # launch-poster generation skill
.env.example                       # MODIFY: new vars
```

---

### Task 1: Test scaffold + env contract

**Files:**
- Modify: `package.json` (add vitest + test script)
- Modify: `.env.example`
- Create: `src/lib/voice/session.test.ts` (placeholder-free smoke test proving the runner works)

**Interfaces:**
- Produces: `npm test` runs vitest; env names `AUDIENCE_MCP_URL`, `AUDIENCE_MCP_TOKEN`, `XAI_VOICE_MODEL`, `XAI_VOICE`, `X_POSTING_ENABLED` used by later tasks.

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add test script to package.json**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run"
```

- [ ] **Step 3: Append the harness section to `.env.example`** (after the `SIMULATION_PROVIDER` block, before the Backend section)

```bash
# ─────────────── Voice harness (Grok Voice Agent API) ───────────────
# Realtime model + voice for the speech-to-speech session
XAI_VOICE_MODEL=grok-voice-latest
XAI_VOICE=eve
# Teammates' pgvector-on-Neon MCP (Streaming HTTP/SSE). Unset = tool omitted,
# the copilot still works from the tribe catalog inlined in its instructions.
AUDIENCE_MCP_URL=
AUDIENCE_MCP_TOKEN=
# X posting tool. Off = the post_to_x tool always returns a draft preview.
X_POSTING_ENABLED=false
```

- [ ] **Step 4: Write a first failing test** (also pins the session module's public name)

```ts
// src/lib/voice/session.test.ts
import { describe, it, expect } from "vitest";
import { buildSessionPayload } from "./session";

describe("buildSessionPayload", () => {
  it("returns a session.update payload with instructions", () => {
    const p = buildSessionPayload({ clusters: [], totalFollowers: 0, mcpUrl: undefined });
    expect(p.type).toBe("session.update");
    expect(p.session.instructions.length).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run src/lib/voice/session.test.ts`
Expected: FAIL — `Cannot find module './session'`

- [ ] **Step 6: Commit** (scaffold only; the module lands in Task 2)

```bash
git add package.json package-lock.json .env.example src/lib/voice/session.test.ts
git commit -m "chore(voice): vitest scaffold + harness env contract"
```

---

### Task 2: Session payload builder (`session.ts`)

**Files:**
- Create: `src/lib/voice/session.ts`
- Modify: `src/lib/voice/session.test.ts` (full assertions)

**Interfaces:**
- Consumes: `AudienceCluster` from `@/lib/audience/types`.
- Produces: `buildSessionPayload(opts: { clusters: Pick<AudienceCluster,"id"|"label"|"members"|"blurb">[]; totalFollowers: number; mcpUrl?: string; mcpToken?: string; voice?: string }): SessionPayload` where `SessionPayload = { type: "session.update"; session: { voice: string; instructions: string; turn_detection: { type: "server_vad" }; tools: unknown[]; audio: {...} } }`. Also exports `CLIENT_TOOL_NAMES = ["focus_cluster","generate_image","edit_image","generate_video","post_to_x"] as const`.

- [ ] **Step 1: Extend the test with real assertions**

```ts
// src/lib/voice/session.test.ts
import { describe, it, expect } from "vitest";
import { buildSessionPayload, CLIENT_TOOL_NAMES } from "./session";

const clusters = [
  { id: "students", label: "Students & EdTech", members: 4388, blurb: "price + relatability" },
];

describe("buildSessionPayload", () => {
  it("returns a session.update payload with instructions", () => {
    const p = buildSessionPayload({ clusters: [], totalFollowers: 0 });
    expect(p.type).toBe("session.update");
    expect(p.session.instructions.length).toBeGreaterThan(50);
  });

  it("inlines the tribe catalog into instructions", () => {
    const p = buildSessionPayload({ clusters, totalFollowers: 18442 });
    expect(p.session.instructions).toContain("students");
    expect(p.session.instructions).toContain("4,388");
  });

  it("declares every client tool exactly once", () => {
    const p = buildSessionPayload({ clusters, totalFollowers: 18442 });
    const names = p.session.tools
      .filter((t: any) => t.type === "function")
      .map((t: any) => t.name);
    expect(names.sort()).toEqual([...CLIENT_TOOL_NAMES].sort());
  });

  it("adds the MCP entry only when a URL is configured", () => {
    const none = buildSessionPayload({ clusters, totalFollowers: 0 });
    expect(none.session.tools.some((t: any) => t.type === "mcp")).toBe(false);
    const withMcp = buildSessionPayload({ clusters, totalFollowers: 0, mcpUrl: "https://mcp.example.com/mcp", mcpToken: "tok" });
    const mcp = withMcp.session.tools.find((t: any) => t.type === "mcp") as any;
    expect(mcp.server_url).toBe("https://mcp.example.com/mcp");
    expect(mcp.authorization).toBe("Bearer tok");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/voice/session.test.ts` → FAIL (module missing)

- [ ] **Step 3: Implement `session.ts`**

```ts
// src/lib/voice/session.ts
// Single source of truth for the realtime session: instructions + every tool.
// Adding a tool = one entry here + one handler in tools.ts. Nothing else.
import type { AudienceCluster } from "@/lib/audience/types";

export const CLIENT_TOOL_NAMES = [
  "focus_cluster",
  "generate_image",
  "edit_image",
  "generate_video",
  "post_to_x",
] as const;
export type ClientToolName = (typeof CLIENT_TOOL_NAMES)[number];

type ClusterLite = Pick<AudienceCluster, "id" | "label" | "members" | "blurb">;

export interface SessionOptions {
  clusters: ClusterLite[];
  totalFollowers: number;
  mcpUrl?: string;
  mcpToken?: string;
  voice?: string;
}

function instructions(clusters: ClusterLite[], totalFollowers: number): string {
  const catalog = clusters
    .map((c) => `- id "${c.id}": ${c.label} — ${c.members.toLocaleString("en-US")} followers. ${c.blurb}`)
    .join("\n");
  return [
    "You are the AgentSim campaign copilot: a launch strategist for posting on X.",
    "You speak briefly and confidently, like a sharp creative director. One question at a time.",
    `The founder's ${totalFollowers.toLocaleString("en-US")} followers are clustered into tribes:`,
    catalog || "(tribe catalog unavailable — ask the audience MCP tools when needed)",
    "",
    "Core loop: (1) help pick a target tribe — call focus_cluster the moment one is chosen",
    "so the audience map zooms; (2) interview the founder about the product; (3) draft a",
    "post and call generate_image for its poster (use edit_image to iterate, never start",
    "over unless asked); (4) when the founder approves, call post_to_x — first WITHOUT",
    "confirm to show the draft, then with confirm=true only after an explicit yes.",
    "Use x_search for what's live on X right now (competitor launches, hook styles).",
    "Use the audience MCP tools (when available) for deep tribe stats and member lookups.",
    "Never invent engagement numbers; only cite what tools return.",
  ].join("\n");
}

export function buildSessionPayload(opts: SessionOptions) {
  const tools: unknown[] = [
    { type: "x_search" },
    {
      type: "function",
      name: "focus_cluster",
      description: "Zoom/highlight one audience tribe in the 3D map. Call as soon as a target tribe is chosen.",
      parameters: {
        type: "object",
        properties: { cluster_id: { type: "string", description: "Tribe id from the catalog, e.g. 'students'" } },
        required: ["cluster_id"],
      },
    },
    {
      type: "function",
      name: "generate_image",
      description: "Generate a launch poster/image with Grok Imagine. Returns a URL the UI also renders.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Full visual description incl. style, mood, text lockups" },
          aspect_ratio: { type: "string", enum: ["1:1", "16:9", "3:2", "2:3"], description: "2:3 for posters" },
        },
        required: ["prompt"],
      },
    },
    {
      type: "function",
      name: "edit_image",
      description: "Edit the most recent (or a given) generated image with Grok Imagine.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "The change to make, e.g. 'warmer palette, add $99 badge'" },
          image_url: { type: "string", description: "Image to edit; omit to edit the latest generation" },
        },
        required: ["prompt"],
      },
    },
    {
      type: "function",
      name: "generate_video",
      description: "Animate an image (or a text prompt) into a short launch video with Grok Imagine.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          image_url: { type: "string", description: "Optional still to animate" },
        },
        required: ["prompt"],
      },
    },
    {
      type: "function",
      name: "post_to_x",
      description: "Draft (and, after explicit confirmation, publish) a post to X. Without confirm=true this only returns a preview.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          media_url: { type: "string", description: "Poster/video URL to attach" },
          confirm: { type: "boolean", description: "true ONLY after the founder explicitly says to post" },
        },
        required: ["text"],
      },
    },
  ];

  if (opts.mcpUrl) {
    tools.push({
      type: "mcp",
      server_url: opts.mcpUrl,
      server_label: "audience-vectors",
      ...(opts.mcpToken ? { authorization: `Bearer ${opts.mcpToken}` } : {}),
    });
  }

  return {
    type: "session.update" as const,
    session: {
      voice: opts.voice ?? "eve",
      instructions: instructions(opts.clusters, opts.totalFollowers),
      turn_detection: { type: "server_vad" as const },
      tools,
      audio: {
        input: { format: { type: "audio/pcm", rate: 24000 } },
        output: { format: { type: "audio/pcm", rate: 24000 } },
      },
    },
  };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/voice/session.test.ts` → PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/session.ts src/lib/voice/session.test.ts
git commit -m "feat(voice): session payload builder — instructions, client tools, optional audience MCP"
```

---

### Task 3: Token route (`/api/voice/token`)

**Files:**
- Create: `src/app/api/voice/token/route.ts`

**Interfaces:**
- Consumes: `buildSessionPayload` (Task 2), `getAudienceProvider` from `@/lib/audience/registry`, `getStorage` from `@/lib/storage`.
- Produces: `POST /api/voice/token` → `{ token: string, model: string, sessionPayload: SessionPayload }`. Client connects with `new WebSocket(url, ["xai-client-secret." + token])` and sends `sessionPayload` verbatim.

- [ ] **Step 1: Implement the route**

```ts
// src/app/api/voice/token/route.ts
import { NextResponse } from "next/server";
import { buildSessionPayload } from "@/lib/voice/session";
import { getAudienceProvider } from "@/lib/audience/registry";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const XAI_BASE_URL = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";

export async function POST(req: Request) {
  const key = process.env.XAI_API_KEY;
  if (!key) return NextResponse.json({ error: "XAI_API_KEY not set" }, { status: 500 });

  const { projectId } = await req.json().catch(() => ({ projectId: undefined }));

  // Mint a short-lived client secret (docs: POST /v1/realtime/client_secrets;
  // the endpoint does not accept a `session` field, so config rides alongside).
  const mint = await fetch(`${XAI_BASE_URL}/realtime/client_secrets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
  });
  if (!mint.ok) {
    const detail = await mint.text().catch(() => "");
    return NextResponse.json({ error: `token mint failed: ${mint.status} ${detail.slice(0, 200)}` }, { status: 502 });
  }
  const minted = await mint.json();
  // Field name per docs example; fall back defensively across shapes.
  const token: string | undefined = minted.client_secret?.value ?? minted.value ?? minted.token;
  if (!token) return NextResponse.json({ error: "no token in mint response" }, { status: 502 });

  const settings = await getStorage().getSettings();
  const snapshot = await getAudienceProvider().getAudience({
    handle: settings.xAccount?.handle,
    projectId,
  });

  const sessionPayload = buildSessionPayload({
    clusters: snapshot.clusters,
    totalFollowers: snapshot.totalFollowers,
    mcpUrl: process.env.AUDIENCE_MCP_URL || undefined,
    mcpToken: process.env.AUDIENCE_MCP_TOKEN || undefined,
    voice: process.env.XAI_VOICE || undefined,
  });

  return NextResponse.json({
    token,
    model: process.env.XAI_VOICE_MODEL ?? "grok-voice-latest",
    sessionPayload,
  });
}
```

- [ ] **Step 2: Manual verification** (needs `XAI_API_KEY` in `.env.local`)

Run: `npm run dev`, then:

```bash
curl -s -X POST localhost:3000/api/voice/token -H 'Content-Type: application/json' -d '{}' | python3 -m json.tool | head -30
```

Expected: JSON with a `token` string, `model`, and `sessionPayload.session.tools` containing `x_search` + 5 function tools. If the mint response shape differs, fix the `token` extraction line to match what you see and note the real field name in a code comment.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/voice/token/route.ts
git commit -m "feat(voice): ephemeral token route returning server-built session payload"
```

---

### Task 4: PCM audio utilities (`pcm.ts`)

**Files:**
- Create: `src/lib/voice/pcm.ts`
- Create: `src/lib/voice/pcm.test.ts`

**Interfaces:**
- Produces: `floatTo16BitPCMBase64(f32: Float32Array): string` and `base64ToFloat32(b64: string): Float32Array` — used by `client.ts` for mic upload and playback.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/voice/pcm.test.ts
import { describe, it, expect } from "vitest";
import { floatTo16BitPCMBase64, base64ToFloat32 } from "./pcm";

describe("pcm round trip", () => {
  it("survives encode → decode within int16 quantization error", () => {
    const src = new Float32Array([0, 0.5, -0.5, 1, -1, 0.001]);
    const out = base64ToFloat32(floatTo16BitPCMBase64(src));
    expect(out.length).toBe(src.length);
    for (let i = 0; i < src.length; i++) expect(Math.abs(out[i] - src[i])).toBeLessThan(1 / 32000);
  });

  it("clamps out-of-range samples instead of wrapping", () => {
    const out = base64ToFloat32(floatTo16BitPCMBase64(new Float32Array([2, -2])));
    expect(out[0]).toBeCloseTo(1, 3);
    expect(out[1]).toBeCloseTo(-1, 2);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/voice/pcm.test.ts` → FAIL

- [ ] **Step 3: Implement**

```ts
// src/lib/voice/pcm.ts
// PCM16LE ⇄ Float32 ⇄ base64, isomorphic (browser atob/btoa vs Node Buffer).

const toB64 = (bytes: Uint8Array): string =>
  typeof btoa === "function"
    ? btoa(String.fromCharCode(...bytes))
    : Buffer.from(bytes).toString("base64");

const fromB64 = (b64: string): Uint8Array =>
  typeof atob === "function"
    ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    : new Uint8Array(Buffer.from(b64, "base64"));

export function floatTo16BitPCMBase64(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return toB64(new Uint8Array(i16.buffer));
}

export function base64ToFloat32(b64: string): Float32Array {
  const bytes = fromB64(b64);
  const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / (i16[i] < 0 ? 0x8000 : 0x7fff);
  return f32;
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/voice/pcm.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/pcm.ts src/lib/voice/pcm.test.ts
git commit -m "feat(voice): isomorphic PCM16 base64 codec"
```

---

### Task 5: Client tool registry (`tools.ts`) + galaxy zoom wiring

**Files:**
- Create: `src/lib/voice/tools.ts`
- Create: `src/lib/voice/tools.test.ts`
- Modify: `src/components/galaxy/GalaxyView.tsx` (add one `useEffect` listener; component keeps its own `selected` state — see line ~26 `const [selected, setSelected] = useState<string | null>(null)`; the `9abe155` panning/PostCard changes don't affect this approach)

**Interfaces:**
- Consumes: `ClientToolName` from Task 2.
- Produces: `dispatchTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string>` (always resolves to a JSON string for `function_call_output`; unknown tool → `{"error":...}` JSON, never a throw). `ToolContext = { projectId?: string }`. DOM event contract: `window.dispatchEvent(new CustomEvent("agentsim:focus-cluster", { detail: { clusterId } }))`.

- [ ] **Step 1: Write failing tests** (pure paths only — fetch-backed handlers are exercised in Task 6's manual check)

```ts
// src/lib/voice/tools.test.ts
// @vitest-environment jsdom  ← only if jsdom is installed; otherwise stub window as below.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatchTool } from "./tools";

describe("dispatchTool", () => {
  beforeEach(() => {
    (globalThis as any).window = { dispatchEvent: vi.fn() };
  });

  it("focus_cluster dispatches the DOM event and reports success", async () => {
    const out = JSON.parse(await dispatchTool("focus_cluster", { cluster_id: "students" }, {}));
    expect(out.ok).toBe(true);
    const ev = (window.dispatchEvent as any).mock.calls[0][0];
    expect(ev.type).toBe("agentsim:focus-cluster");
    expect(ev.detail.clusterId).toBe("students");
  });

  it("unknown tools return an error payload instead of throwing", async () => {
    const out = JSON.parse(await dispatchTool("nope", {}, {}));
    expect(out.error).toContain("unknown tool");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/voice/tools.test.ts` → FAIL

- [ ] **Step 3: Implement the registry**

```ts
// src/lib/voice/tools.ts
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
      projectId: ctx.projectId,
    });
  },

  async post_to_x(args, ctx) {
    return callApi("/api/x/post", {
      text: args.text,
      mediaUrl: args.media_url ?? lastImageUrl,
      confirm: args.confirm === true,
      projectId: ctx.projectId,
    });
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
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/voice/tools.test.ts` → PASS

- [ ] **Step 5: Wire the galaxy listener.** In `src/components/galaxy/GalaxyView.tsx`, next to the existing `selected` state, add:

```tsx
useEffect(() => {
  const onFocus = (e: Event) => {
    const { clusterId } = (e as CustomEvent<{ clusterId: string }>).detail;
    if (snapshot?.clusters.some((c) => c.id === clusterId)) setSelected(clusterId);
  };
  window.addEventListener("agentsim:focus-cluster", onFocus);
  return () => window.removeEventListener("agentsim:focus-cluster", onFocus);
}, [snapshot]);
```

(`useEffect` is already imported in that file; if not, extend the react import.)

- [ ] **Step 6: Manual verification of the zoom path.** `npm run dev` → open `/dashboard/audience` → in the browser console:

```js
window.dispatchEvent(new CustomEvent("agentsim:focus-cluster", { detail: { clusterId: "students" } }))
```

Expected: the galaxy selects/zooms the Students tribe exactly as if clicked.

- [ ] **Step 7: Commit**

```bash
git add src/lib/voice/tools.ts src/lib/voice/tools.test.ts src/components/galaxy/GalaxyView.tsx
git commit -m "feat(voice): client tool registry + agent-driven galaxy zoom"
```

---

### Task 6: Imagine tool route (`/api/imagine`)

**Files:**
- Create: `src/app/api/imagine/route.ts`

**Interfaces:**
- Consumes: `getImageProvider()`, `getVideoProvider()` from `@/lib/providers/registry` (already implemented — check exact export names in that file; the registry pattern shows `textProviders/imageProviders/videoProviders` with getters near the bottom).
- Produces: `POST /api/imagine` with `{kind: "image"|"edit"|"video", prompt, imageUrl?, aspectRatio?, projectId?}` → `{url: string, kind: string}` (video returns when polling completes — same provider behavior the campaign routes `/api/campaign/baseline` + `/api/campaign/tailor` rely on).

- [ ] **Step 1: Read the provider surface first** — `src/lib/providers/types.ts` and the bottom of `registry.ts` — and match the exact option names (`ImageGenOptions`, `VideoGenOptions`). The route below assumes `generate({prompt, aspectRatio?, referenceImages?})` for images and `generate({prompt, imageUrl?})` for video; adjust to the real signatures.

```ts
// src/app/api/imagine/route.ts
import { NextResponse } from "next/server";
import { getImageProvider, getVideoProvider } from "@/lib/providers/registry";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { kind, prompt, imageUrl, aspectRatio } = await req.json();
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  try {
    if (kind === "video") {
      const video = await getVideoProvider().generate({ prompt, imageUrl });
      return NextResponse.json({ kind, url: video.url });
    }
    const image = await getImageProvider().generate({
      prompt,
      aspectRatio,
      ...(kind === "edit" && imageUrl ? { referenceImages: [imageUrl] } : {}),
    });
    return NextResponse.json({ kind, url: image.url });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
```

- [ ] **Step 2: Manual verification** (uses real XAI_API_KEY — one cheap image)

```bash
curl -s -X POST localhost:3000/api/imagine -H 'Content-Type: application/json' \
  -d '{"kind":"image","prompt":"flat minimal poster of a cute desk robot, violet gradient","aspectRatio":"2:3"}' | python3 -m json.tool
```

Expected: `{"kind":"image","url":"https://..."}` — open the URL and confirm it rendered.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/imagine/route.ts
git commit -m "feat(voice): tool-shaped Imagine route over existing providers"
```

---

### Task 7: Realtime client (`client.ts`)

**Files:**
- Create: `src/lib/voice/client.ts`

**Interfaces:**
- Consumes: `floatTo16BitPCMBase64`, `base64ToFloat32` (Task 4); `dispatchTool` (Task 5); `/api/voice/token` (Task 3).
- Produces: `class RealtimeClient` with `connect(projectId?: string): Promise<void>`, `startMic(): Promise<void>`, `stopMic(): void`, `sendText(text: string): void`, `disconnect(): void`, and an `onState: (s: VoiceState) => void` callback where `VoiceState = { status: "idle"|"connecting"|"listening"|"speaking"|"error"; caption?: string; userCaption?: string; lastError?: string }`. Used by `VoiceDock` (Task 8).

- [ ] **Step 1: Implement**

```ts
// src/lib/voice/client.ts
"use client";
// One WebSocket = the whole agent. Voice and text share the session; tool
// calls round-trip through dispatchTool. No custom STT/agent loop anywhere.
import { base64ToFloat32, floatTo16BitPCMBase64 } from "./pcm";
import { dispatchTool, type ToolContext } from "./tools";

export interface VoiceState {
  status: "idle" | "connecting" | "listening" | "speaking" | "error";
  caption?: string;
  userCaption?: string;
  lastError?: string;
}

const WS_URL = "wss://api.x.ai/v1/realtime";
const RATE = 24000;

export class RealtimeClient {
  onState: (s: VoiceState) => void = () => {};
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private micNode: ScriptProcessorNode | null = null;
  private micStream: MediaStream | null = null;
  private playHead = 0;
  private state: VoiceState = { status: "idle" };
  private toolCtx: ToolContext = {};

  private set(patch: Partial<VoiceState>) {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  async connect(projectId?: string) {
    this.toolCtx = { projectId };
    this.set({ status: "connecting" });
    const res = await fetch("/api/voice/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      this.set({ status: "error", lastError: `token: ${res.status}` });
      return;
    }
    const { token, model, sessionPayload } = await res.json();

    // Browsers can't set WS headers; the token rides the subprotocol (docs).
    const ws = new WebSocket(`${WS_URL}?model=${encodeURIComponent(model)}`, [
      `xai-client-secret.${token}`,
    ]);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify(sessionPayload));
      this.set({ status: "listening" });
    };
    ws.onmessage = (ev) => this.handleEvent(JSON.parse(ev.data));
    ws.onerror = () => this.set({ status: "error", lastError: "websocket error" });
    ws.onclose = () => this.set({ status: "idle" });
  }

  private async handleEvent(e: any) {
    switch (e.type) {
      case "response.created":
        this.set({ status: "speaking" });
        break;
      case "response.done":
        this.set({ status: "listening" });
        break;
      case "response.output_audio.delta":
        if (e.delta) this.playChunk(base64ToFloat32(e.delta));
        break;
      case "response.output_text.delta":
      case "response.output_audio_transcript.delta":
        if (e.delta) this.set({ caption: (this.state.caption ?? "") + e.delta });
        break;
      case "response.output_audio_transcript.done":
        break;
      case "conversation.item.input_audio_transcription.updated":
        this.set({ userCaption: e.transcript ?? e.delta ?? this.state.userCaption });
        break;
      case "response.function_call_arguments.done": {
        const output = await dispatchTool(e.name, JSON.parse(e.arguments || "{}"), this.toolCtx);
        this.ws?.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: e.call_id, output },
          }),
        );
        this.ws?.send(JSON.stringify({ type: "response.create" }));
        break;
      }
      case "error":
        this.set({ status: "error", lastError: e.error?.message ?? "server error" });
        break;
    }
  }

  /** Text path — same brain, same session (docs: conversation.item.create + response.create). */
  sendText(text: string) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.set({ caption: "", userCaption: text });
    this.ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
      }),
    );
    this.ws.send(JSON.stringify({ type: "response.create" }));
  }

  async startMic() {
    if (this.micNode) return;
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
    this.ctx ??= new AudioContext({ sampleRate: RATE });
    await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.micStream);
    // ScriptProcessor: deprecated but 10 lines and works everywhere. Swap for
    // an AudioWorklet post-hackathon.
    const node = this.ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (ev) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: floatTo16BitPCMBase64(ev.inputBuffer.getChannelData(0)),
          }),
        );
      }
    };
    src.connect(node);
    node.connect(this.ctx.destination); // keeps the node alive; it outputs silence
    this.micNode = node;
  }

  stopMic() {
    this.micNode?.disconnect();
    this.micNode = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
  }

  private playChunk(f32: Float32Array) {
    this.ctx ??= new AudioContext({ sampleRate: RATE });
    const buf = this.ctx.createBuffer(1, f32.length, RATE);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    this.playHead = Math.max(this.playHead, now) ;
    src.start(this.playHead);
    this.playHead += buf.duration;
  }

  disconnect() {
    this.stopMic();
    this.ws?.close();
    this.ws = null;
  }
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.

- [ ] **Step 3: Manual smoke (console).** With dev server running and a real key, on any page:

```js
const { RealtimeClient } = await import("/src/lib/voice/client.ts"); // or expose temporarily on window from a page
const c = new RealtimeClient(); c.onState = console.log;
await c.connect(); c.sendText("Say hi in five words.");
```

Expected: state transitions connecting → listening → speaking, audible reply, `caption` accumulating. (Full UI verification lands with Task 8 — skip this step if importing modules in the console is awkward in your setup.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/voice/client.ts
git commit -m "feat(voice): realtime client — one WS for voice, text, and tool round-trips"
```

---

### Task 8: VoiceDock UI (orb + voice/text toggle — two equal input modes, one session)

**Files:**
- Create: `src/components/VoiceDock.tsx`
- Modify: `src/components/chat/ChatRoom.tsx` (mount `<VoiceDock projectId={projectId} />` near the composer; ChatRoom already renders GalaxyView dynamically, so the zoom events land)
- Modify: `src/components/AudienceHome.tsx` (mount `<VoiceDock />` so the audience map page can be voice-driven too)

**Interfaces:**
- Consumes: `RealtimeClient`, `VoiceState` (Task 7).
- Produces: self-contained widget; no props except optional `projectId`.

- [ ] **Step 1: Implement** (Tailwind classes per the app's existing dark idiom — `bg-surface`, `border-line`, `text-muted` names exist in the codebase; match what ChatRoom uses)

```tsx
// src/components/VoiceDock.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, MessageSquare, X as XIcon } from "lucide-react";
import { RealtimeClient, type VoiceState } from "@/lib/voice/client";

export function VoiceDock({ projectId }: { projectId?: string }) {
  const clientRef = useRef<RealtimeClient | null>(null);
  const [state, setState] = useState<VoiceState>({ status: "idle" });
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => () => clientRef.current?.disconnect(), []);

  async function ensureConnected(): Promise<RealtimeClient> {
    if (!clientRef.current) {
      const c = new RealtimeClient();
      c.onState = setState;
      clientRef.current = c;
      await c.connect(projectId);
    }
    return clientRef.current;
  }

  async function toggleVoice() {
    setOpen(true);
    const c = await ensureConnected();
    if (mode === "voice") {
      if (state.status === "idle" || !stateIsLive(state)) return;
      await c.startMic();
    }
  }

  const stateIsLive = (s: VoiceState) => s.status === "listening" || s.status === "speaking";

  async function start(m: "voice" | "text") {
    setMode(m);
    setOpen(true);
    const c = await ensureConnected();
    if (m === "voice") await c.startMic();
    else c.stopMic();
  }

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const c = await ensureConnected();
    c.sendText(draft.trim());
    setDraft("");
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2">
      {open && (state.userCaption || state.caption) && (
        <div className="pointer-events-auto max-w-xl space-y-1.5 px-4">
          {state.caption && (
            <div className="rounded-2xl border border-line bg-surface/90 px-4 py-2.5 text-sm backdrop-blur">
              {state.caption}
            </div>
          )}
          {state.userCaption && (
            <div className="rounded-2xl border border-line bg-raised/90 px-4 py-2 text-sm text-muted backdrop-blur">
              {state.userCaption}
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-2">
        {open && mode === "text" && (
          <form onSubmit={submitText} className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type to the copilot…"
              className="w-72 rounded-full border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-fg/30"
            />
          </form>
        )}

        {/* The orb: idle=dim, listening=pulse ring, speaking=fast pulse */}
        <button
          onClick={() => start("voice")}
          aria-label="Talk to the copilot"
          className={[
            "relative grid h-14 w-14 place-items-center rounded-full border transition",
            state.status === "speaking"
              ? "animate-pulse border-fg/40 bg-fg/15"
              : state.status === "listening"
                ? "border-fg/30 bg-fg/10"
                : "border-line bg-surface hover:bg-raised",
          ].join(" ")}
        >
          {mode === "voice" && stateIsLive(state) ? <Mic size={20} /> : <MicOff size={20} className="text-muted" />}
          {state.status === "listening" && (
            <span className="absolute inset-0 animate-ping rounded-full border border-fg/20" />
          )}
        </button>

        <button
          onClick={() => start(mode === "text" ? "voice" : "text")}
          aria-label="Switch voice/text"
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-muted hover:bg-raised"
        >
          {mode === "text" ? <Mic size={16} /> : <MessageSquare size={16} />}
        </button>

        {open && (
          <button
            onClick={() => {
              clientRef.current?.disconnect();
              clientRef.current = null;
              setState({ status: "idle" });
              setOpen(false);
            }}
            aria-label="End session"
            className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-muted hover:bg-raised"
          >
            <XIcon size={16} />
          </button>
        )}
      </div>

      {open && (
        <span className="text-xs text-muted">
          {state.status === "error" ? `error — ${state.lastError}` : state.status}
          {state.status === "listening" && mode === "voice" ? " · mic live" : ""}
        </span>
      )}
    </div>
  );
}
```

(Note: `toggleVoice` above is superseded by `start("voice")` — delete it during implementation if unused; it's shown because some composers prefer a single toggle handler.)

- [ ] **Step 2: Mount it.** In `ChatRoom.tsx` add `import { VoiceDock } from "../VoiceDock";` and render `<VoiceDock projectId={projectId} />` as the last child of the root element. In `AudienceHome.tsx` render `<VoiceDock />` likewise.

- [ ] **Step 3: Manual verification — the full loop.** `npm run dev`, open a project chat (Chrome, with `XAI_API_KEY` set):
  1. Click the orb → mic permission → say **"Zoom to my students tribe."** Expected: audible reply + galaxy zooms (Task 5 event fires).
  2. Toggle to text → type **"Generate a launch poster for a desk robot for students."** Expected: agent calls `generate_image`, replies referencing it, and `/api/imagine` returns a URL (Network tab).
  3. Say **"Post it."** Expected: agent calls `post_to_x` WITHOUT confirm → draft JSON comes back; agent reads back the draft and asks for confirmation.

- [ ] **Step 4: Typecheck + tests** — `npx tsc --noEmit && npm test` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/VoiceDock.tsx src/components/chat/ChatRoom.tsx src/components/AudienceHome.tsx
git commit -m "feat(voice): Siri-style VoiceDock with voice/text toggle, mounted in chat + audience map"
```

---

### Task 9 (OPTIONAL, time-permitting): X posting route

**Files:**
- Create: `src/app/api/x/post/route.ts`

**Interfaces:**
- Consumes: `getStorage().getSettings()` for the linked account; env `X_POSTING_ENABLED`.
- Produces: `POST /api/x/post` `{text, mediaUrl?, confirm}` → `{posted: false, draft: {...}}` unless `confirm===true` AND `X_POSTING_ENABLED===true` AND an OAuth token with write scope exists.

- [ ] **Step 1: Implement draft-first**

```ts
// src/app/api/x/post/route.ts
import { NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { text, mediaUrl, confirm } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const draft = { text, mediaUrl: mediaUrl ?? null };
  const enabled = process.env.X_POSTING_ENABLED === "true";
  if (!confirm || !enabled) {
    return NextResponse.json({
      posted: false,
      draft,
      note: !enabled
        ? "X_POSTING_ENABLED is false — draft only."
        : "Draft preview. Call again with confirm=true after the founder approves.",
    });
  }

  const settings = await getStorage().getSettings();
  const accessToken = (settings.xAccount as { accessToken?: string } | undefined)?.accessToken;
  if (!accessToken) {
    return NextResponse.json({ posted: false, draft, error: "no linked X account with write access" });
  }

  // Media upload is out of scope for the hour: post text, link the media URL.
  const body = { text: mediaUrl ? `${text}\n${mediaUrl}` : text };
  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ posted: false, draft, error: `X API ${res.status}`, detail: json }, { status: 502 });
  return NextResponse.json({ posted: true, id: json.data?.id, draft });
}
```

  *(Check the real shape of `settings.xAccount` in `src/lib/accounts/` first — the stub provider may not store an access token; in that case the draft path is the demo path, which is fine.)*

- [ ] **Step 2: Manual verification (draft path — safe)**

```bash
curl -s -X POST localhost:3000/api/x/post -H 'Content-Type: application/json' \
  -d '{"text":"byte launches sept 4 🚀","confirm":false}' | python3 -m json.tool
```

Expected: `{"posted": false, "draft": {...}}`. Do NOT test `confirm:true` against a real account until demo rehearsal.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/x/post/route.ts
git commit -m "feat(voice): draft-first X posting tool route (flag-gated)"
```

---

### Task 10: Grok Build dev harness (`.mcp.json` + imagine-poster skill)

**Files:**
- Create: `.mcp.json`
- Create: `.grok/skills/imagine-poster/SKILL.md`
- Modify: `AGENTS.md` if present, else create it (one pointer section)

**Interfaces:**
- Produces: `grok` (Grok Build CLI) started in the repo root discovers the audience MCP + the skill; teammates test tools conversationally without the web UI.

- [ ] **Step 1: Create `.mcp.json`** (Claude-Code-compatible config; Grok Build reads the same shape — if your build doesn't auto-discover it, add the server via Grok Build's extensions modal or `grok inspect`)

```json
{
  "mcpServers": {
    "audience-vectors": {
      "type": "http",
      "url": "${AUDIENCE_MCP_URL}",
      "headers": { "Authorization": "Bearer ${AUDIENCE_MCP_TOKEN}" }
    }
  }
}
```

- [ ] **Step 2: Create the skill** (`.grok/skills/` is on Grok Build's discovery path)

```markdown
---
name: imagine-poster
description: Generate or iterate an X launch poster with Grok Imagine — tribe-tuned style, price/date lockups, 2:3 ratio. Use for any "make/edit the poster" request.
---

# Launch posters with Grok Imagine

Endpoints (XAI_API_KEY): POST https://api.x.ai/v1/images/generations
{model:"grok-imagine-image-quality", prompt} → {url}; edits go to /v1/images/edits
with {image:{url,type:"image_url"}}. In the app, use POST /api/imagine instead
({kind:"image"|"edit"|"video", prompt, imageUrl?, aspectRatio:"2:3"}).

Prompt recipe — always include, in order:
1. Format: "launch poster, 2:3 portrait, bold single focal product"
2. The product, physically described (never a brand name alone)
3. Tribe tuning: students→warm/relatable/price-forward; builders→dark/technical/spec-forward;
   designers→typographic/minimal; founders→traction metrics lockup
4. Text lockups in quotes, max 3: launch date, price badge, one-line hook
5. Style anchors: "clean vector-adjacent render, premium gradient background, no watermark"

Iterate with edits (keep composition, change one axis per call):
"warmer palette, add '$99 EARLY BIRD' badge top-right, keep robot pose".
Iterate ≤3 times; present each to the founder before the next change.
```

- [ ] **Step 3: Add the pointer in `AGENTS.md`** (root; create if missing)

```markdown
## Dev harness (Grok Build)

Run `grok` in the repo root. It picks up `.mcp.json` (audience vector MCP —
export AUDIENCE_MCP_URL / AUDIENCE_MCP_TOKEN first) and `.grok/skills/`
(imagine-poster). Use it to exercise MCP + Imagine tools conversationally;
the production path is the in-app VoiceDock (src/lib/voice/).
```

- [ ] **Step 4: Manual verification** — `grok` in repo root → ask "list your tools" → expect audience MCP tools (when URL is set) and the skill discoverable; ask "use the imagine-poster skill to draft a poster prompt for a student desk robot" → expect a recipe-following prompt.

- [ ] **Step 5: Commit**

```bash
git add .mcp.json .grok/skills/imagine-poster/SKILL.md AGENTS.md
git commit -m "chore(harness): Grok Build dev config — audience MCP + imagine-poster skill"
```

---

## Self-review (done at planning time)

- **Spec coverage:** voice front-end w/ text option (Tasks 3,7,8) · Voice Agent API replaces custom STT+loop (7) · vector-store MCP consumed not built (2,3,10) · Imagine tools as thin wrapper (6) + skill (10) · optional X posting (9) · Obsidian-graph "zoom to cluster X" one-way command (5) · Grok Build harness (10) · x_search question answered (Decisions).
- **Placeholder scan:** all code blocks complete; two explicitly-flagged verify-against-reality points (token mint response field, provider option names) with concrete fallback instructions — these are unknowns only resolvable at runtime, marked as verification steps rather than TBDs.
- **Type consistency:** `dispatchTool(name, args, ctx) → Promise<string>` matches client.ts usage; `VoiceState` matches VoiceDock; `CLIENT_TOOL_NAMES` matches handlers keys plus declared schemas; event name `agentsim:focus-cluster` identical in tools.ts/GalaxyView/manual test.

## Demo-day runbook (after all tasks)

1. `.env.local`: `XAI_API_KEY`, `AUDIENCE_MCP_URL` (when teammates ship it), leave `X_POSTING_ENABLED=false` until rehearsal.
2. `npm run dev` → project chat → orb → the Task 8 Step 3 script is the demo script.
3. Fallbacks: mic denied → text toggle; MCP down → catalog-from-instructions still answers tribe questions; Imagine slow → `edit_image` on the last URL is faster than regenerating.
