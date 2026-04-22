// S4-W21 — HTTP glue for /price-history.
// Validates input, canonicalizes URL, fetches (or fixtures) the series,
// caches in KV for 24h, computes stats + verdict.

import type { Context } from "hono";
import { PriceHistoryQuerySchema, type PriceHistoryResponse, type PricePoint } from "./types.js";
import { canonicalize } from "./canonical.js";
import { computeStats } from "./stats.js";
import { detectSale } from "./detect.js";
import { generateFixtureSeries } from "./fixture.js";
import { fetchKeepaSeries } from "./keepa.js";

interface KvLike {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, opts?: { expirationTtl?: number }) => Promise<void>;
}

interface HandlerEnv {
  LENS_KV?: KvLike;
  KEEPA_API_KEY?: string;
  LENS_PRICE_MODE?: "keepa" | "fixture" | "auto" | "none";
}

const CACHE_TTL_SECONDS = 86_400;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface CachedEntry {
  generatedAt: string;
  response: Omit<PriceHistoryResponse, "cacheAgeSec">;
}

function ageSec(generatedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(generatedAt)) / 1000));
}

export async function handlePriceHistory(
  c: Context<{ Bindings: HandlerEnv }>,
): Promise<Response> {
  const queryShape = {
    url: c.req.query("url"),
    category: c.req.query("category"),
    claimedDiscountPct: c.req.query("claimedDiscountPct"),
  };
  const parsed = PriceHistoryQuerySchema.safeParse(queryShape);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }

  const canon = canonicalize(parsed.data.url);
  if (!canon) {
    return c.json({ error: "invalid_url" }, 400);
  }

  const cacheKey = `pricehist:${await sha256Hex(canon.canonicalUrl)}`;
  const kv = c.env.LENS_KV;
  if (kv) {
    const raw = await kv.get(cacheKey);
    if (raw) {
      try {
        const cached = JSON.parse(raw) as CachedEntry;
        const response: PriceHistoryResponse = {
          ...cached.response,
          cacheAgeSec: ageSec(cached.generatedAt),
        };
        return c.json(response);
      } catch {
        // fall through and recompute
      }
    }
  }

  const mode = c.env.LENS_PRICE_MODE ?? "auto";
  const { series, source } = await loadSeries(canon.productId, canon.canonicalUrl, mode, c.env);

  const stats = computeStats(series);
  const { verdict, explanation, discountClaimed, discountActual } = detectSale({
    stats,
    ...(parsed.data.claimedDiscountPct !== undefined
      ? { claimedDiscountPct: parsed.data.claimedDiscountPct }
      : {}),
  });

  const generatedAt = new Date().toISOString();
  const response: PriceHistoryResponse = {
    url: parsed.data.url,
    canonicalUrl: canon.canonicalUrl,
    host: canon.host,
    ...(canon.productId ? { productId: canon.productId } : {}),
    currency: "USD",
    series,
    current: stats.current,
    median90: stats.median,
    min90: stats.min,
    max90: stats.max,
    stddev90: stats.stddev,
    saleVerdict: verdict,
    saleExplanation: explanation,
    ...(discountClaimed !== undefined ? { discountClaimed } : {}),
    ...(discountActual !== undefined ? { discountActual } : {}),
    source,
    cacheAgeSec: 0,
    generatedAt,
  };

  if (kv) {
    const { cacheAgeSec: _unused, ...withoutCacheAge } = response;
    void _unused;
    const toCache: CachedEntry = {
      generatedAt,
      response: withoutCacheAge,
    };
    try {
      await kv.put(cacheKey, JSON.stringify(toCache), { expirationTtl: CACHE_TTL_SECONDS });
    } catch (err) {
      console.error("[price-history] kv put error:", (err as Error).message);
    }
  }

  return c.json(response);
}

async function loadSeries(
  productId: string | undefined,
  canonicalUrl: string,
  mode: "keepa" | "fixture" | "auto" | "none",
  env: HandlerEnv,
): Promise<{ series: PricePoint[]; source: "keepa" | "fixture" | "none" }> {
  if (mode === "none") {
    return { series: [], source: "none" };
  }
  if (mode !== "fixture" && env.KEEPA_API_KEY && productId) {
    const series = await fetchKeepaSeries(productId, { apiKey: env.KEEPA_API_KEY });
    if (series && series.length > 0) return { series, source: "keepa" };
    if (mode === "keepa") return { series: [], source: "none" };
  }
  const { series } = generateFixtureSeries(canonicalUrl);
  return { series, source: "fixture" };
}
