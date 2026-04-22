# F14 — MCP server (third worker)

**Status:** in progress. Critical for "Best use of Managed Agents" + "Most Creative Opus 4.7 Exploration" special prizes.

## Why
External AI agents (Claude Desktop, Claude Code, third-party frameworks) should be able to call Lens as a first-class tool via the Model Context Protocol. One `claude mcp add lens <url>` and any Claude session can now audit its own shopping recommendations, look up regulations, check for dark patterns, etc.

## Scope
Build `workers/mcp/` as the third Cloudflare Worker. Implement a minimal JSON-RPC 2.0 MCP server with:

- `initialize` — handshake, returns protocol version + server info
- `tools/list` — returns the tool definitions (7 tools)
- `tools/call` — dispatches to the tool handler, proxies to lens-api where appropriate
- Optional SSE endpoint for streaming (deferred)

### Tools exposed

| Tool | Description | Proxies to |
|---|---|---|
| `lens.audit` | Audit an AI shopping recommendation. Params: `{kind, source, raw, userPrompt?}` or `{kind:"query", userPrompt}` | `POST lens-api/audit` |
| `lens.spec_optimal` | Rank candidates against stated criteria. Params: `{category, criteria}` | `POST lens-api/audit` (kind=query) |
| `lens.dark_pattern_scan` | Verify dark-pattern hits from Stage-1 heuristics. Params: `{host, pageType, hits}` | `POST lens-api/passive-scan` (future) |
| `lens.regulation_lookup` | Get a regulation pack by slug. Params: `{slug}` | `GET lens-api/packs/regulation/:slug` |
| `lens.pack_get` | Get any pack by slug. Params: `{slug}` | `GET lens-api/packs/:slug` |
| `lens.pack_list` | List packs with optional type filter. Params: `{type?: "category"|"dark-pattern"|...}` | `GET lens-api/packs/stats` |
| `lens.intervention_draft` | Draft an intervention letter. Params: `{type, context}` | (local; uses intervention packs) |

## Files
- `workers/mcp/wrangler.toml`
- `workers/mcp/package.json`
- `workers/mcp/tsconfig.json`
- `workers/mcp/src/index.ts` — Hono app with POST /mcp JSON-RPC dispatcher + GET /mcp (info) + GET /health
- `workers/mcp/src/jsonrpc.ts` — JSON-RPC parse + response helpers
- `workers/mcp/src/tools.ts` — tool definitions + schemas
- `workers/mcp/src/dispatch.ts` — dispatch tool calls
- `workers/mcp/src/tools.test.ts` — tool schema tests
- `workers/mcp/src/jsonrpc.test.ts` — JSON-RPC conformance

## Protocol shape (minimal MCP 2024-11-05)

```
POST /mcp   (body: JSON-RPC 2.0)
→ initialize: {jsonrpc:"2.0", id, method:"initialize", params:{protocolVersion, capabilities, clientInfo}}
← {jsonrpc:"2.0", id, result:{protocolVersion, capabilities:{tools:{}}, serverInfo:{name, version}}}

→ tools/list: {jsonrpc:"2.0", id, method:"tools/list"}
← {jsonrpc:"2.0", id, result:{tools:[...]}}

→ tools/call: {jsonrpc:"2.0", id, method:"tools/call", params:{name, arguments:{...}}}
← {jsonrpc:"2.0", id, result:{content:[{type:"text", text:"..."}], isError?:false}}
```

## Acceptance
- [ ] `workers/mcp` builds + deploys as third Cloudflare Worker.
- [ ] `POST /mcp` with `initialize` returns valid response.
- [ ] `tools/list` returns 7 tools with valid JSON Schema params.
- [ ] `tools/call` for `lens.pack_list` returns pack stats.
- [ ] `tools/call` for `lens.audit` proxies through lens-api and returns the audit result.
- [ ] Error responses conform to JSON-RPC 2.0 error shape.
- [ ] 10+ tests.
- [ ] Live smoke: `curl lens-mcp.webmarinelli.workers.dev/mcp -d '{jsonrpc...}'`.
