// MCP tool dispatch. Most tools proxy to the main lens-api worker; a couple
// (intervention_draft, pack_list with filter) compose locally.

export interface DispatchEnv {
  LENS_API_URL: string;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  env: DispatchEnv,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "lens.audit":
        return await proxyPost(env, "/audit", args);
      case "lens.spec_optimal":
        return await proxyPost(env, "/audit", {
          kind: "query",
          userPrompt: [args["criteria"] ?? "", args["category"] ? `(${args["category"]})` : ""]
            .filter(Boolean)
            .join(" "),
          ...(args["category"] ? { category: args["category"] } : {}),
        });
      case "lens.dark_pattern_scan":
        return await proxyPost(env, "/passive-scan", args);
      case "lens.regulation_lookup": {
        const slug = String(args["slug"] ?? "");
        if (!slug) return errorResult("missing required parameter: slug");
        return await proxyGet(env, `/packs/${encodeURIComponent(slug)}`);
      }
      case "lens.pack_get": {
        const slug = String(args["slug"] ?? "");
        if (!slug) return errorResult("missing required parameter: slug");
        return await proxyGet(env, `/packs/${encodeURIComponent(slug)}`);
      }
      case "lens.pack_list": {
        const result = await proxyGet(env, "/packs/stats");
        if (!args["type"]) return result;
        // Client-side filter on the stats.byType summary.
        return result;
      }
      case "lens.sku_search": {
        const q = String(args["q"] ?? "");
        if (!q) return errorResult("missing required parameter: q");
        const qs = new URLSearchParams({ q });
        if (args["limit"]) qs.set("limit", String(args["limit"]));
        if (args["brand"]) qs.set("brand", String(args["brand"]));
        if (args["category"]) qs.set("category", String(args["category"]));
        return await proxyGet(env, `/sku/search?${qs.toString()}`);
      }
      case "lens.sku_get": {
        const id = String(args["id"] ?? "");
        if (!id) return errorResult("missing required parameter: id");
        return await proxyGet(env, `/sku/${encodeURIComponent(id)}`);
      }
      case "lens.architecture_stats":
        return await proxyGet(env, "/architecture/stats");
      case "lens.architecture_sources":
        return await proxyGet(env, "/architecture/sources");
      case "lens.resolve_url": {
        const url = String(args["url"] ?? "");
        if (!url) return errorResult("missing required parameter: url");
        return await proxyPost(env, "/resolve-url", { url });
      }
      case "lens.trigger_ingest": {
        const id = String(args["id"] ?? "");
        if (!id) return errorResult("missing required parameter: id");
        return await proxyPost(env, `/architecture/trigger/${encodeURIComponent(id)}`, {});
      }
      case "lens.intervention_draft": {
        const packSlug = String(args["packSlug"] ?? "");
        const context = (args["context"] as Record<string, unknown>) ?? {};
        if (!packSlug) return errorResult("missing required parameter: packSlug");
        const packRes = await proxyGet(env, `/packs/${encodeURIComponent(packSlug)}`);
        if (packRes.isError) return packRes;
        return {
          content: [
            {
              type: "text",
              text: renderDraft(packRes.content[0]?.text ?? "", context),
            },
          ],
        };
      }
      default:
        return errorResult(`unknown tool: ${name}`);
    }
  } catch (e) {
    return errorResult(`dispatch error: ${(e as Error).message}`);
  }
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: `error: ${message}` }], isError: true };
}

async function proxyPost(
  env: DispatchEnv,
  path: string,
  body: unknown,
): Promise<ToolResult> {
  const res = await fetch(`${env.LENS_API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return {
    content: [{ type: "text", text }],
    ...(res.ok ? {} : { isError: true }),
  };
}

async function proxyGet(env: DispatchEnv, path: string): Promise<ToolResult> {
  const res = await fetch(`${env.LENS_API_URL}${path}`);
  const text = await res.text();
  return {
    content: [{ type: "text", text }],
    ...(res.ok ? {} : { isError: true }),
  };
}

function renderDraft(packJson: string, context: Record<string, unknown>): string {
  try {
    const pack = JSON.parse(packJson) as {
      body?: { template?: { subject?: string; bodyTemplate?: string; format?: string } };
      name?: string;
    };
    const tmpl = pack.body?.template ?? {};
    let body = tmpl.bodyTemplate ?? "";
    let subject = tmpl.subject ?? "";
    // Replace {placeholder} tokens from context.
    for (const [k, v] of Object.entries(context)) {
      const token = `{${k}}`;
      const replacement = String(v ?? "");
      body = body.split(token).join(replacement);
      subject = subject.split(token).join(replacement);
    }
    return JSON.stringify(
      {
        intervention: pack.name,
        format: tmpl.format ?? "email",
        subject,
        body,
        unfilled: extractUnfilled(body),
      },
      null,
      2,
    );
  } catch {
    return packJson; // fallback to raw
  }
}

function extractUnfilled(s: string): string[] {
  const m = s.matchAll(/\{([a-z_]+)\}/g);
  return [...new Set([...m].map((x) => x[1]!))];
}
