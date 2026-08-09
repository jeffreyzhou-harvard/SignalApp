import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatchTool } from "./tools";

describe("dispatchTool", () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = { dispatchEvent: vi.fn() };
  });

  it("focus_cluster dispatches the DOM event and reports success", async () => {
    (globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
    const out = JSON.parse(await dispatchTool("focus_cluster", { cluster_id: "students" }, {}));
    expect(out.ok).toBe(true);
    const ev = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ev.type).toBe("agentsim:focus-cluster");
    expect(ev.detail.clusterId).toBe("students");
  });

  it("unknown tools return an error payload instead of throwing", async () => {
    const out = JSON.parse(await dispatchTool("nope", {}, {}));
    expect(out.error).toContain("unknown tool");
  });

  it("post_to_x without confirm returns a draft and never touches the network", async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = vi.fn();
    const out = JSON.parse(
      await dispatchTool("post_to_x", { text: "byte launches sept 4", confirm: false }, {}),
    );
    expect(out.posted).toBe(false);
    expect(out.draft.text).toBe("byte launches sept 4");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("post_to_x with confirm publishes via /api/publish", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ posted: true, id: "123" }),
    }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    const out = JSON.parse(
      await dispatchTool("post_to_x", { text: "go", confirm: true }, {}),
    );
    expect(out.posted).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/publish", expect.objectContaining({ method: "POST" }));
  });

  it("handler exceptions become error payloads, never throws", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      dispatchEvent: () => {
        throw new Error("boom");
      },
    };
    const out = JSON.parse(await dispatchTool("focus_cluster", { cluster_id: "x" }, {}));
    expect(out.error).toContain("boom");
  });
});
