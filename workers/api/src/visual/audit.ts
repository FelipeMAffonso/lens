// IMPROVEMENT_PLAN_V2 V-VISUAL — visual audit endpoint.
//
// Chrome extension captures the entire product page (tab screenshot, full
// scroll height, base64 PNG) and POSTs it here with the URL. Opus 4.7's
// high-resolution vision (3.75MP, NEW in 4.7) parses:
//   * product name + brand + model
//   * price (current, original if sale, currency)
//   * star rating + review count
//   * claimed country of origin / "made in X" labels
//   * seller name + "sold by" info
//   * key specs (spec table, bullet list)
//   * images visible
//   * any badges, stickers, certifications
//
// Parsed structured product is then UPSERTED into sku_catalog (bypassing the
// robots.txt ceiling that blocks web_search / scraping), and the audit
// pipeline runs over it: triangulation against existing rows, recall check,
// GS1 origin vs claim-origin consistency, price-history lookup.

import type { Context } from "hono";
import { z } from "zod";
import type { Env } from "../index.js";
import { OPUS_4_7, client } from "../anthropic.js";

export const VisualAuditSchema = z.object({
  url: z.string().url().max(4000),
  pageTitle: z.string().max(500).optional(),
  screenshotBase64: z.string().min(1000).max(8_000_000), // ≤ ~6MB base64
  viewport: z.object({
    width: z.number().int().min(100).max(4000),
    height: z.number().int().min(100).max(40000),
  }).optional(),
  userQuery: z.string().max(2000).optional(),
});

const SYSTEM = `
You are the visual parser for Lens, a consumer-welfare independent shopping
agent. You receive a full-page screenshot of a retailer product page and
must extract the facts the page shows, exactly. You NEVER invent or infer
data that isn't visible. You NEVER add marketing spin or your own opinion.

OUTPUT: Return ONLY a JSON object with this exact shape, no prose, no
markdown fences:

{
  "name": "full product name as shown",
  "brand": "brand or 'unknown'",
  "model": "model number if visible, else null",
  "asin": "if amazon, the ASIN from URL or page, else null",
  "gtin": "13-14 digit barcode if visible, else null",
  "upc": "12-digit UPC if visible, else null",
  "priceCurrent": { "amount": number, "currency": "USD|EUR|...|null", "original": number|null, "onSale": true|false },
  "rating": { "stars": number|null, "count": number|null },
  "seller": { "name": "seller name or null", "type": "first-party|third-party|marketplace|unknown" },
  "claimedOrigin": "country name as printed on page or null",
  "certifications": [ "UL", "ENERGY STAR", "CE", ... (as shown) ],
  "specs": { "keyA": "valueA", "keyB": "valueB", ... },
  "visibleImageUrls": [ "first few image URLs visible" ],
  "topBullets": [ "first 3-5 marketing bullets verbatim" ],
  "anyUrgencyBadges": [ "Only 3 left!", "Selling fast", etc. if present ],
  "warnings": [ "any on-page warnings, recalls, notices" ]
}

IMPORTANT:
- You can see the image. Do the work. If you cannot see a field clearly,
  set it to null, DO NOT guess.
- "claimedOrigin" is what the page PRINTS (e.g. "Made in USA"). We'll
  triangulate with the GS1 barcode country separately.
- "topBullets" must be the literal bullet text, not your paraphrase.
`.trim();

export async function handleVisualAudit(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json().catch(() => null);
  const parsed = VisualAuditSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const { url, screenshotBase64, userQuery, pageTitle } = parsed.data;

  if (!c.env.ANTHROPIC_API_KEY) {
    return c.json({ error: "vision_unavailable" }, 503);
  }

  const anthropic = client(c.env);

  // Strip any "data:image/png;base64," prefix.
  const b64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");

  const userContent = [
    {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: b64 },
    } as never,
    {
      type: "text",
      text: `URL: ${url}\n${pageTitle ? `Page title: ${pageTitle}\n` : ""}${userQuery ? `User context: ${userQuery}\n` : ""}\n\nExtract the JSON described in the system instructions.`,
    },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let res: { content: Array<{ type: string; text?: string }> };
  try {
    res = (await anthropic.messages.create(
      {
        model: OPUS_4_7,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: userContent as never }],
      } as never,
      { signal: controller.signal } as never,
    )) as unknown as typeof res;
  } catch (err) {
    clearTimeout(timer);
    return c.json({ error: "vision_call_failed", message: (err as Error).message }, 502);
  }
  clearTimeout(timer);

  let text = "";
  for (const block of res.content) {
    if (block.type === "text" && block.text) text += block.text;
  }
  text = text.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim();

  let extracted: Record<string, unknown>;
  try {
    extracted = JSON.parse(text);
  } catch {
    return c.json({ error: "vision_parse_failed", raw: text.slice(0, 1000) }, 502);
  }

  // Upsert into sku_catalog. Fall back to URL-hash id if no barcode/asin.
  const asin = (extracted.asin as string | undefined) ?? null;
  const gtin = (extracted.gtin as string | undefined) ?? null;
  const upc = (extracted.upc as string | undefined) ?? null;
  const brand = String((extracted.brand as string | undefined) ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "unknown";
  const skuId = asin
    ? `amazon:${asin}`
    : gtin
      ? `gtin:${gtin}`
      : upc
        ? `upc:${upc}`
        : `visual:${await sha1Hex(url)}`;

  if (c.env.LENS_D1) {
    try {
      // Ensure brand.
      await c.env.LENS_D1.prepare(
        "INSERT INTO brand_index (slug, name) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING",
      ).bind(brand, String(extracted.brand ?? brand)).run();

      await c.env.LENS_D1.prepare(
        `INSERT INTO sku_catalog (id, canonical_name, brand_slug, model_code, asin, gtin, upc, image_url, specs_json, first_seen_at, last_refreshed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           canonical_name = excluded.canonical_name,
           specs_json = excluded.specs_json,
           image_url = excluded.image_url,
           last_refreshed_at = datetime('now')`,
      ).bind(
        skuId,
        String(extracted.name ?? "").slice(0, 200),
        brand,
        (extracted.model as string | undefined) ?? null,
        asin,
        gtin,
        upc,
        ((extracted.visibleImageUrls as string[] | undefined) ?? [])[0] ?? null,
        JSON.stringify(extracted.specs ?? {}),
      ).run();

      await c.env.LENS_D1.prepare(
        `INSERT INTO sku_source_link (sku_id, source_id, external_id, external_url, specs_json, price_cents, observed_at, confidence, active)
         VALUES (?, 'visual-audit', ?, ?, ?, ?, datetime('now'), 0.95, 1)
         ON CONFLICT(sku_id, source_id, external_id) DO UPDATE SET
           external_url = excluded.external_url,
           specs_json = excluded.specs_json,
           price_cents = excluded.price_cents,
           observed_at = datetime('now')`,
      ).bind(
        skuId,
        url,
        url,
        JSON.stringify(extracted),
        priceToCents(extracted.priceCurrent as Record<string, unknown> | undefined),
      ).run();
    } catch (err) {
      console.warn("[visual-audit] D1 write failed:", (err as Error).message);
    }
  }

  return c.json({
    skuId,
    extracted,
    hashedUrl: await sha1Hex(url),
    model: OPUS_4_7,
  });
}

function priceToCents(p: Record<string, unknown> | undefined): number | null {
  if (!p) return null;
  const amt = Number(p.amount);
  if (!Number.isFinite(amt)) return null;
  return Math.round(amt * 100);
}

async function sha1Hex(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-1", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
