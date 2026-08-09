import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { dynamicTool, jsonSchema, type ToolSet } from "ai";

/**
 * Connects the launch copilot to the audience MCP server (backend `/mcp`) and
 * exposes its tools to the Vercel AI SDK tool loop.
 *
 * The MCP is our own FastMCP server over the ingested X audience in Postgres.
 * Running the client here (server-side in the Next.js route) means we call the
 * MCP directly — no public tunnel, no xAI-side execution — so it works in local
 * dev and prod alike. Config over hardcoding: point `AUDIENCE_MCP_HTTP_URL` (or
 * fall back to `BACKEND_URL`) at the server.
 */

const MCP_URL =
  process.env.AUDIENCE_MCP_HTTP_URL ??
  `${process.env.BACKEND_URL ?? "http://localhost:8000"}/mcp`;

export interface AudienceMcp {
  /** MCP tools wrapped as AI SDK tools, keyed by tool name. */
  tools: ToolSet;
  /** Close the underlying MCP connection. Always call in `onFinish`. */
  close: () => Promise<void>;
}

/** Flatten an MCP tool result's content parts into a single string for the model. */
function contentToText(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(content)) return JSON.stringify(result);
  const text = content
    .map((p) => (p?.type === "text" && typeof p.text === "string" ? p.text : JSON.stringify(p)))
    .join("\n");
  return text || JSON.stringify(result);
}

/**
 * Connect and wrap every MCP tool. Returns null (not throws) if the MCP is
 * unreachable, so the copilot degrades to a tool-less chat instead of erroring.
 */
export async function connectAudienceMcp(): Promise<AudienceMcp | null> {
  try {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "signal-launch-copilot", version: "0.1.0" });
    await client.connect(transport);

    const { tools: mcpTools } = await client.listTools();
    const tools: ToolSet = {};
    for (const t of mcpTools) {
      tools[t.name] = dynamicTool({
        description: t.description ?? t.name,
        inputSchema: jsonSchema(
          (t.inputSchema as object) ?? { type: "object", properties: {} },
        ),
        execute: async (args) => {
          const result = await client.callTool({
            name: t.name,
            arguments: (args ?? {}) as Record<string, unknown>,
          });
          return contentToText(result);
        },
      });
    }

    return { tools, close: () => client.close() };
  } catch (err) {
    console.error("[audience-mcp] connect failed; copilot runs without tools:", err);
    return null;
  }
}
