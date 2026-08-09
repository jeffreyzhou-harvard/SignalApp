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
