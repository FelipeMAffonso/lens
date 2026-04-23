// MCP tool definitions. Each tool ships a JSON Schema for its inputs that
// external clients (Claude Desktop, Claude Code, etc.) use to populate calls.

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export const TOOLS: McpToolDef[] = [
  {
    name: "lens.audit",
    description:
      "Audit an AI shopping recommendation against a transparent spec-optimal utility function. Returns the AI's pick, Lens's pick, verified claims, cross-assistant disagreement, and a welfare-delta.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["text", "query", "url", "image", "photo"],
          description: "Input shape. 'text' = paste of AI answer, 'query' = plain user shopping question, 'url' = product page, 'image' / 'photo' = base64 screenshot.",
        },
        source: {
          type: "string",
          enum: ["chatgpt", "claude", "gemini", "rufus", "unknown"],
          description: "Which AI assistant produced the answer being audited (for 'text' / 'image' kinds).",
        },
        raw: { type: "string", description: "The AI's full response text (for 'text' kind)." },
        userPrompt: { type: "string", description: "The user's original prompt, if available." },
        url: { type: "string", description: "A product page URL (for 'url' kind)." },
        imageBase64: { type: "string", description: "Base64 image (for 'image' / 'photo' kinds)." },
        category: { type: "string", description: "Optional category hint." },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
  {
    name: "lens.spec_optimal",
    description:
      "Rank real products for a category against user-stated criteria using a transparent weighted utility function. No AI in the loop; pure math + live product data.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Product category slug (e.g. 'espresso-machines', 'laptops')." },
        criteria: {
          type: "string",
          description: "Natural-language criteria (e.g. 'pressure + build quality + steam matter most, under $400').",
        },
      },
      required: ["category", "criteria"],
      additionalProperties: false,
    },
  },
  {
    name: "lens.dark_pattern_scan",
    description:
      "Verify Stage-1 dark-pattern heuristic hits against the full Brignull canonical taxonomy + applicable regulation packs (FTC Junk Fees Rule, CCPA, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Host of the page being scanned." },
        pageType: {
          type: "string",
          enum: ["checkout", "cart", "product", "booking", "signup", "any"],
          description: "Page type classification.",
        },
        hits: {
          type: "array",
          description: "Stage-1 heuristic hits (from the extension's content script).",
          items: {
            type: "object",
            properties: {
              packSlug: { type: "string" },
              brignullId: { type: "string" },
              excerpt: { type: "string" },
            },
          },
        },
      },
      required: ["host", "pageType", "hits"],
      additionalProperties: false,
    },
  },
  {
    name: "lens.regulation_lookup",
    description:
      "Look up a regulation pack by slug. Returns scope, effective dates, vacated status, user rights in plain language, and enforcement signals.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Pack slug, e.g. 'regulation/us-federal-ftc-junk-fees'.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "lens.pack_get",
    description: "Retrieve any knowledge pack by slug (category/dark-pattern/regulation/fee/intervention).",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "lens.pack_list",
    description: "List all registered Lens knowledge packs + registry stats.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["category", "dark-pattern", "regulation", "fee", "intervention"],
          description: "Optional filter by pack type.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "lens.sku_search",
    description:
      "Fuzzy-search the triangulated SKU catalog (Phase A data spine, 27 public sources). Returns matches with brand, model, triangulated median price, and source count. Use before audit/spec_optimal when you already know the product.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Query string (brand + model works best, e.g. 'Breville Bambino')." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max matches (default 20)." },
        brand: { type: "string", description: "Optional brand-slug filter." },
        category: { type: "string", description: "Optional category-code filter (UNSPSC or Wikidata class slug)." },
      },
      required: ["q"],
      additionalProperties: false,
    },
  },
  {
    name: "lens.sku_get",
    description:
      "Fetch a single SKU's full detail from the data spine: canonical name, brand, specs, triangulated price with p25/p75, contributing sources, and any matched recalls.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "SKU id (e.g. 'wd:Q12345' for Wikidata, 'usda:123' for USDA foods, 'visual:<sha1>' for visual-audit captures).",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "lens.architecture_stats",
    description:
      "Return live Lens data-spine metrics: indexed SKU count, brand count, configured/healthy source counts, recalls tracked, regulations in force, last successful ingest run. Sourced from D1 architecture_stats view, cached ~15s.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "lens.architecture_sources",
    description:
      "Return the full registry of Lens data sources (29 sources as of 2026-04-23) with per-source status, cadence, last run, row count, and docs URL. Lets an external agent introspect exactly what Lens ingests and how fresh each feed is before composing a user-facing claim.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "lens.resolve_url",
    description:
      "Link recognition. Takes any retailer URL, parses { retailer, id, brand, model } with affiliate-tag stripping (tag, ref, utm_*). Looks up against the triangulated SKU catalog and returns matched candidates with price + source count. Supports Amazon (ASIN), Steam (appid), Best Buy (skuId), Walmart (ip/id), Target (A-id), Newegg (/p/id), Home Depot / Lowe's / Costco (last-numeric).",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri", description: "A retailer product page URL." },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "lens.trigger_ingest",
    description:
      "Manually kick off an ingester for one Lens data source (e.g. 'cisa-kev', 'fda-510k', 'ftc-enforcement'). Unauthenticated but rate-limited. Each ingester is idempotent (INSERT OR IGNORE everywhere). Returns rowsUpserted + errors + duration. Useful for demos and for filling a specific gap on demand.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "data_source.id (e.g. 'cisa-kev', 'fda-510k', 'cfpb-complaints', 'unspsc'). Full list via lens.architecture_sources.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "lens.intervention_draft",
    description:
      "Draft a consumer-protection letter (return request, subscription cancellation, FTC / CFPB complaint) using the applicable intervention pack template.",
    inputSchema: {
      type: "object",
      properties: {
        packSlug: {
          type: "string",
          description: "Intervention pack slug (e.g. 'intervention/draft-magnuson-moss-return').",
        },
        context: {
          type: "object",
          description: "User-supplied fill-ins (product name, order id, purchase date, seller, defect description, etc.).",
          additionalProperties: true,
        },
      },
      required: ["packSlug", "context"],
      additionalProperties: false,
    },
  },
];
