import type { Candidate, UserIntent } from "@lens/shared";
import type { Env } from "./index.js";
import { OPUS_4_7, client } from "./anthropic.js";
import { lookupCatalog } from "./fixtureCatalog.js";
import { findCategoryPack } from "./packs/registry.js";

/**
 * Candidate search.
 *
 * Two modes:
 *  - "fixture" (LENS_SEARCH_MODE=fixture): deterministic, hand-curated catalog. Fast (<10 ms).
 *    Used for the submission demo and CI regression tests.
 *  - "real" (default): live Opus 4.7 web search with dynamic filtering. Slower (~30-90 s) and
 *    subject to Cloudflare subrequest timeout — capped aggressively to fit.
 */
export async function searchCandidates(intent: UserIntent, env: Env): Promise<Candidate[]> {
  if (env.LENS_SEARCH_MODE === "fixture") {
    // Prefer pack-declared representativeSkus when available; this is the
    // G13 SKU index: every category pack can ship its own SKU fixtures.
    const pack = findCategoryPack(intent.category);
    const skus = pack?.body.representativeSkus;
    if (skus && skus.length > 0) {
      console.log("[search] using %d representativeSkus from pack %s", skus.length, pack.slug);
      return skus.map((s) => ({
        name: s.name,
        brand: s.brand,
        price: s.priceUsd ?? null,
        currency: s.currency ?? "USD",
        ...(s.url ? { url: s.url } : {}),
        ...(s.imageUrl ? { thumbnailUrl: s.imageUrl } : {}),
        specs: s.specs,
        attributeScores: {},
        utilityScore: 0,
        utilityBreakdown: [],
      }));
    }
    // Fallback to legacy fixtureCatalog for categories without pack SKUs yet
    return lookupCatalog(intent.category);
  }

  // LIVE WEB SEARCH PATH
  const anthropic = client(env);

  const system = `You are a product research agent. Find 6-8 real products matching the user's category and criteria.
For each product return: name, brand, price (USD), product URL, and a specs object covering each listed criterion.
Omit specs that are not on the source page — never fabricate. Return a single JSON object {"candidates": [...]}.
No prose outside the JSON. No markdown fences.`;

  const userText = [
    `CATEGORY: ${intent.category}`,
    `CRITERIA: ${intent.criteria.map((c) => `${c.name} (${c.direction}, weight ${c.weight.toFixed(2)})`).join(", ")}`,
    intent.budget
      ? `BUDGET: up to ${intent.budget.max ?? "no cap"} ${intent.budget.currency}`
      : "",
    "",
    "Return 6-8 candidates only. Prioritize speed — do not exceed 4 web searches.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = (await anthropic.messages.create({
    model: OPUS_4_7,
    max_tokens: 6000,
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 4,
      } as never,
    ],
    system,
    messages: [{ role: "user", content: userText }],
  } as never)) as unknown as { content: Array<{ type: string; text?: string }> };

  let text = "";
  for (const block of res.content) {
    if (block.type === "text" && block.text) text += block.text;
  }
  console.log("[search] raw_text_length=%d first_200=%s", text.length, text.slice(0, 200));

  if (!text.trim()) {
    throw new Error(
      `search returned empty text; ${res.content.length} blocks of types: ${res.content.map((b) => b.type).join(",")}`,
    );
  }

  const json = stripFences(text);
  let parsed: { candidates?: Candidate[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`search returned non-JSON: ${json.slice(0, 300)}`);
  }
  if (!parsed.candidates || !Array.isArray(parsed.candidates)) {
    throw new Error(`search response missing 'candidates' array: keys=${Object.keys(parsed).join(",")}`);
  }
  return parsed.candidates.map((c) => ({
    ...c,
    currency: c.currency ?? "USD",
    attributeScores: {},
    utilityScore: 0,
    utilityBreakdown: [],
  }));
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m && m[1] ? m[1] : s).trim();
}
