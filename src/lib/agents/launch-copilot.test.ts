import { describe, expect, it } from "vitest";
import { buildLaunchSystemPrompt, toModelMessages } from "./launch-copilot";
import type { AudienceSnapshot } from "@/lib/audience/types";
import type { AppSettings, ChatMessage, Project } from "@/lib/types";

const project: Project = {
  id: "p1",
  title: "Launchpad",
  createdAt: "2026-08-09T00:00:00Z",
  updatedAt: "2026-08-09T00:00:00Z",
  thumbnail: null,
};

const settings: AppSettings = { xAccount: null };

function snapshot(seedAccountId?: string): AudienceSnapshot {
  return {
    totalFollowers: 1005,
    clusters: [
      { id: "0", label: "AI Infra Engineers", members: 637, color: "#000", blurb: "Builders at AI labs.", center: [0, 0, 0] },
      { id: "1", label: "Crypto Traders", members: 64, color: "#111", blurb: "On-chain degens.", center: [0, 0, 0] },
    ],
    members: [],
    source: "db:v5",
    synthetic: false,
    seedAccountId,
  };
}

describe("buildLaunchSystemPrompt", () => {
  it("injects the real cluster catalog so the copilot is niche-aware", () => {
    const p = buildLaunchSystemPrompt({ project, settings, snapshot: snapshot("1596"), hasMcp: true });
    expect(p).toContain("AI Infra Engineers");
    expect(p).toContain("637");
    expect(p).toContain("Launchpad");
  });

  it("scopes MCP tools to the founder's seed_account_id when known", () => {
    const p = buildLaunchSystemPrompt({ project, settings, snapshot: snapshot("1596433997462048769"), hasMcp: true });
    expect(p).toContain('seed_account_id="1596433997462048769"');
  });

  it("falls back to list_audiences when no seed is known", () => {
    const p = buildLaunchSystemPrompt({ project, settings, snapshot: snapshot(undefined), hasMcp: true });
    expect(p).toContain("list_audiences");
    expect(p).not.toContain('seed_account_id="');
  });

  it("omits tool guidance when the MCP is unavailable", () => {
    const p = buildLaunchSystemPrompt({ project, settings, snapshot: snapshot("1596"), hasMcp: false });
    expect(p).toContain("Audience tools are unavailable");
    expect(p).not.toContain("list_clusters");
  });
});

describe("toModelMessages", () => {
  const noImages = async () => null;

  it("maps user and assistant turns to model messages", async () => {
    const history: ChatMessage[] = [
      { id: "1", projectId: "p1", role: "user", kind: "text", content: "hi", images: [], createdAt: "" },
      { id: "2", projectId: "p1", role: "assistant", kind: "text", content: "hello", images: [], createdAt: "" },
    ];
    const msgs = await toModelMessages(history, noImages);
    expect(msgs).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("summarizes generated image turns as text placeholders", async () => {
    const history: ChatMessage[] = [
      { id: "3", projectId: "p1", role: "assistant", kind: "image", content: "a poster", images: ["/x.png"], createdAt: "" },
    ];
    const msgs = await toModelMessages(history, noImages);
    expect(msgs[0]).toEqual({ role: "assistant", content: '[Generated poster for prompt: "a poster"]' });
  });

  it("inlines attached images as vision parts", async () => {
    const history: ChatMessage[] = [
      { id: "4", projectId: "p1", role: "user", kind: "text", content: "what is this", images: ["/u.png"], createdAt: "" },
    ];
    const msgs = await toModelMessages(history, async () => "data:image/png;base64,AAAA");
    expect(msgs[0]).toEqual({
      role: "user",
      content: [
        { type: "image", image: "data:image/png;base64,AAAA" },
        { type: "text", text: "what is this" },
      ],
    });
  });
});
