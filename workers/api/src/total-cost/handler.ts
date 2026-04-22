// S4-W24 — HTTP glue for GET /total-cost.
// Fetches the product URL, runs the S3-W15 parser to identify the product +
// infer its category, resolves category pack hidden costs, computes totals.

import type { Context } from "hono";
import { parseProduct } from "../parsers/parse.js";
import { findCategoryPack } from "../packs/registry.js";
import { computeTotals, projectHiddenCosts } from "./compute.js";
import { resolveShipping } from "./shipping.js";
import { resolveTax } from "./tax.js";
import { TotalCostQuerySchema, type TotalCostResponse } from "./types.js";

interface HandlerEnv {
  [k: string]: unknown;
}

export async function handleTotalCost(c: Context<{ Bindings: HandlerEnv }>): Promise<Response> {
  const parsed = TotalCostQuerySchema.safeParse({
    url: c.req.query("url"),
    zip: c.req.query("zip"),
    country: c.req.query("country"),
    overrideSticker: c.req.query("overrideSticker"),
    productName: c.req.query("productName"),
    category: c.req.query("category"),
  });
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { url, zip, country, overrideSticker, productName, category: categoryHint } = parsed.data;

  // Fetch the URL HTML (best-effort; if blocked, fall back to sticker override).
  let rawHtml = "";
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 Lens/1.0" },
    });
    if (res.ok) rawHtml = (await res.text()).slice(0, 300_000);
  } catch (err) {
    console.error("[total-cost] fetch:", (err as Error).message);
  }

  const product = parseProduct(rawHtml, url);
  const sticker = overrideSticker ?? product.price;

  const notes: string[] = [];
  if (!sticker) {
    return c.json({
      error: "no_price_available",
      hint: "structured parser could not find a price; try overrideSticker query param.",
      product,
    }, 422);
  }

  // Category resolution priority: explicit query hint → parser name → overridden name.
  const nameForInference = productName ?? product.name ?? "";
  const category = categoryHint ?? inferCategoryFromName(nameForInference);
  const pack = category ? findCategoryPack(category) : null;
  const hidden = pack ? projectHiddenCosts(pack.body.typicalHiddenCosts) : [];
  if (!pack) {
    notes.push(
      `No category pack matched ${JSON.stringify(category ?? product.name ?? "(unknown)")}; operating-cost estimate omitted.`,
    );
  }
  if (pack) {
    notes.push(`Operating costs sourced from pack ${pack.slug} v${pack.version}.`);
  }
  notes.push("Tax is a state-level baseline; municipal rates may differ.");

  const tax = resolveTax({ ...(zip ? { zip } : {}), country });
  const taxAmount = round2(sticker * tax.rate);
  const shipping = resolveShipping(product.host ?? "", sticker);
  const totals = computeTotals({
    sticker,
    tax: taxAmount,
    shipping: shipping.amount,
    hiddenCosts: hidden,
  });

  const response: TotalCostResponse = {
    url,
    canonicalUrl: product.url ?? url,
    host: product.host ?? "",
    product: {
      name: productName ?? product.name ?? "(unknown)",
      ...(product.brand ? { brand: product.brand } : {}),
      ...(pack ? { category: pack.slug } : {}),
    },
    sticker: round2(sticker),
    currency: "USD",
    tax: {
      rate: tax.rate,
      amount: taxAmount,
      jurisdiction: tax.jurisdiction,
      source: tax.source,
      ...(tax.note ? { note: tax.note } : {}),
    },
    shipping,
    hiddenCosts: hidden,
    totals,
    notes,
  };
  return c.json(response);
}

function inferCategoryFromName(name: string): string | undefined {
  const n = name.toLowerCase();
  const hits: Array<[RegExp, string]> = [
    [/\bespresso\b|\bbarista\b/, "espresso machine"],
    [/\blaptop\b|\bmacbook\b|\bthinkpad\b|\bnotebook\b/, "laptop"],
    [/\bheadphone\b|\bearbuds?\b|\bin-?ears?\b/, "headphones"],
    [/\btv\b|\bsmart television\b|\boled\b|\bqled\b/, "televisions"],
    [/\bvacuum\b|\broborock\b|\bdyson\b/, "vacuum"],
    [/\bblender\b|\bvitamix\b|\bninja blender\b/, "blender"],
    [/\bcamera\b|\bdslr\b|\bmirrorless\b/, "camera"],
    [/\bcoffee\s+maker\b|\bdrip\s+coffee\b/, "coffee maker"],
  ];
  for (const [re, slug] of hits) if (re.test(n)) return slug;
  return undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
