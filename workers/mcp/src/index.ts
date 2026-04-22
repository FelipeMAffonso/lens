// F14 — Lens MCP server. External AI agents call Lens as a first-class tool.
// Exposes a minimal MCP 2024-11-05 JSON-RPC 2.0 surface on POST /mcp.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { ErrorCodes, failure, parseRequest, success } from "./jsonrpc.js";
import { TOOLS } from "./tools.js";
import { callTool, type DispatchEnv } from "./dispatch.js";

interface Env extends DispatchEnv {}

const SERVER_INFO = { name: "lens", version: "0.1.0" };
const PROTOCOL_VERSION = "2024-11-05";

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors({ origin: "*", allowMethods: ["POST", "GET", "OPTIONS"] }));

app.get("/health", (c) =>
  c.json({ ok: true, service: "lens-mcp", ts: new Date().toISOString(), tools: TOOLS.length }),
);

app.get("/mcp", (c) =>
  c.json({
    ...SERVER_INFO,
    protocolVersion: PROTOCOL_VERSION,
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    usage: "POST /mcp with JSON-RPC 2.0 body. See https://modelcontextprotocol.io/",
  }),
);

app.post("/mcp", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const req = parseRequest(raw);
  if (!req) {
    return c.json(failure(null, ErrorCodes.ParseError, "Parse error: expected JSON-RPC 2.0"));
  }
  const id = req.id ?? null;

  try {
    switch (req.method) {
      case "initialize": {
        return c.json(
          success(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          }),
        );
      }
      case "tools/list": {
        return c.json(success(id, { tools: TOOLS }));
      }
      case "tools/call": {
        const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const name = params.name;
        if (!name) {
          return c.json(failure(id, ErrorCodes.InvalidParams, "Missing tool name"));
        }
        if (!TOOLS.some((t) => t.name === name)) {
          return c.json(failure(id, ErrorCodes.MethodNotFound, `Unknown tool: ${name}`));
        }
        const result = await callTool(name, params.arguments ?? {}, c.env);
        return c.json(success(id, result));
      }
      case "ping": {
        return c.json(success(id, {}));
      }
      default: {
        return c.json(failure(id, ErrorCodes.MethodNotFound, `Method not found: ${req.method}`));
      }
    }
  } catch (err) {
    const e = err as Error;
    return c.json(failure(id, ErrorCodes.InternalError, e.message));
  }
});

export default app;
