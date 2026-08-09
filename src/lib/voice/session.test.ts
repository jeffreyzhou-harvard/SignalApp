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

  it("inlines the niche catalog into instructions", () => {
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
    const withMcp = buildSessionPayload({
      clusters,
      totalFollowers: 0,
      mcpUrl: "https://mcp.example.com/mcp",
      mcpToken: "tok",
    });
    const mcp = withMcp.session.tools.find((t: any) => t.type === "mcp") as any;
    expect(mcp.server_url).toBe("https://mcp.example.com/mcp");
    expect(mcp.authorization).toBe("Bearer tok");
  });
});
