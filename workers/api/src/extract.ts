import type { AuditInput, UserIntent, AIRecommendation } from "@lens/shared";
import type { Env } from "./index.js";
import { opusExtendedThinking } from "./anthropic.js";
import { findCategoryPack } from "./packs/registry.js";
import { categoryCriteriaPrompt } from "./packs/prompter.js";
import { scrubTrackingParams } from "./url-scrub.js";
import { parseJinaMarkdown, parseRetailerUrl, type PageExtract } from "./sku/resolve-url.js";
import type { ProductParse } from "./parsers/types.js";
import { derivePreferenceIntent, type PreferenceInferenceOptions } from "./preferences/inference.js";

const SYSTEM_PROMPT = `You audit AI shopping recommendations. Decompose the pasted assistant answer into two JSON objects.

Return a single JSON object (no prose, no markdown fences) with exactly these top-level keys:

{
  "intent": {
    "category": "<short noun phrase, e.g. 'espresso machine' or 'laptop'>",
    "criteria": [
      { "name": "<criterion>", "weight": <0..1>, "direction": "higher_is_better"|"lower_is_better"|"target"|"binary", "target": <optional value>, "confidence": <0..1, your self-assessed confidence that this criterion was explicit in the user's words> }
    ],
    "budget": { "max": <number>, "currency": "USD" },
    "rawCriteriaText": "<user's own words, verbatim>"
  },
  "aiRecommendation": {
    "host": "<chatgpt|claude|gemini|rufus|unknown>",
    "pickedProduct": { "name": "<product name>", "brand": "<brand>", "price": <number>, "currency": "USD" },
    "claims": [
      { "attribute": "<attribute name>", "statedValue": "<exact value the AI stated>" }
    ],
    "reasoningTrace": "<the AI's justification prose, normalized>",
    "citedUrls": []
  }
}

CRITICAL REQUIREMENTS:
- "claims" MUST include every factual attribute assertion the AI made (pressure, RAM, battery life, material, certifications, etc.). Do not leave it empty if the AI cited any specs.
- If the user gave no explicit weights, infer weights from the ORDER and EMPHASIS of their language; earlier and more-emphasized criteria get more weight. Weights must sum to 1.
- "category" must always be a non-empty string.
- If a field is genuinely unknown, use a sensible default (e.g. category = "product", budget = { max: 9999, currency: "USD" }).
- Return ONLY the JSON object. No prose, no explanation, no fenced code block.`;

export async function extractIntentAndRecommendation(
  input: AuditInput,
  env: Env,
): Promise<{ intent: UserIntent; aiRecommendation: AIRecommendation }> {
  // Job 1 primary mode (kind === "query"): no AI in the loop. Derive intent
  // only from the user prompt; skip the AI-recommendation extraction entirely.
  if (input.kind === "query") {
    return extractQueryOnly(input, env);
  }

  // URL / photo modes: fetch-and-parse or vision-parse the real product,
  // treat it as the "AI pick" so the downstream pipeline can audit its claims.
  if (input.kind === "url") {
    return extractFromUrl(input, env);
  }
  if (input.kind === "photo") {
    return extractFromPhoto(input, env);
  }

  const userContent =
    input.kind === "text"
      ? [
          {
            type: "text" as const,
            text: [
              input.userPrompt ? `USER ORIGINAL PROMPT:\n${input.userPrompt}\n\n` : "",
              `AI ASSISTANT OUTPUT (source=${input.source}):\n${input.raw}`,
            ].join(""),
          },
        ]
      : [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              // Judge P0-1 (2026-04-24): drive media_type from the client-
              // provided imageMime. Claude vision accepts png/jpeg/webp/gif.
              // Default to jpeg (phone-camera default) when absent so we
              // don't misparse non-png uploads as png.
              media_type: (input.imageMime ?? "image/jpeg") as
                | "image/png"
                | "image/jpeg"
                | "image/webp"
                | "image/gif",
              data: input.imageBase64,
            },
          },
          {
            type: "text" as const,
            text: `SCREENSHOT of AI assistant answer (source=${input.source}).${input.userPrompt ? ` User's original prompt was: ${input.userPrompt}` : ""} Extract intent and recommendation per the schema.`,
          },
        ];

  // Two-pass extraction: first pass detects the category, second pass uses the
  // applicable category pack (if any) to seed the criteria template.
  const { text: firstPassText } = await opusExtendedThinking(env, {
    system: SYSTEM_PROMPT,
    user: userContent,
    maxOutputTokens: 6000,
    effort: "high",
  });

  const firstJson = stripFences(firstPassText);
  console.log("[extract] first_pass_length=%d first_200=%s", firstPassText.length, firstPassText.slice(0, 200));
  let firstParsed: { intent?: { category?: string } };
  try {
    firstParsed = JSON.parse(firstJson);
  } catch {
    firstParsed = {};
  }

  const categoryGuess = firstParsed.intent?.category;
  const categoryPack = categoryGuess ? findCategoryPack(categoryGuess) : null;
  console.log("[extract] category_guess=%s pack_hit=%s", categoryGuess, categoryPack?.slug ?? "none");

  // If we hit a pack, do a second pass with the criteria template injected.
  // Otherwise keep the first-pass result.
  const text = categoryPack
    ? (
        await opusExtendedThinking(env, {
          system: SYSTEM_PROMPT + "\n\n" + categoryCriteriaPrompt(categoryPack),
          user: userContent,
          maxOutputTokens: 6000,
          effort: "high",
        })
      ).text
    : firstPassText;

  const json = stripFences(text);

  let parsed: { intent?: Partial<UserIntent>; aiRecommendation?: Partial<AIRecommendation> };
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`extract returned non-JSON: ${json.slice(0, 400)}`);
  }

  // Hard defaults so downstream stages never see undefined.
  const intent: UserIntent = {
    category: parsed.intent?.category ?? "product",
    criteria:
      parsed.intent?.criteria && parsed.intent.criteria.length > 0
        ? parsed.intent.criteria
        : [{ name: "overall_quality", weight: 1, direction: "higher_is_better" }],
    rawCriteriaText: parsed.intent?.rawCriteriaText ?? "",
    ...(parsed.intent?.budget ? { budget: parsed.intent.budget } : {}),
  };
  // Normalize criterion weights to sum to 1.
  const total = intent.criteria.reduce((s, c) => s + (c.weight ?? 0), 0) || 1;
  intent.criteria = intent.criteria.map((c) => ({ ...c, weight: (c.weight ?? 0) / total }));

  const ar = parsed.aiRecommendation ?? {};
  const aiRecommendation: AIRecommendation = {
    host: input.source,
    pickedProduct: {
      name: ar.pickedProduct?.name ?? "unknown",
      ...(ar.pickedProduct?.brand ? { brand: ar.pickedProduct.brand } : {}),
      ...(ar.pickedProduct?.price !== undefined ? { price: ar.pickedProduct.price } : {}),
      ...(ar.pickedProduct?.currency ? { currency: ar.pickedProduct.currency } : {}),
    },
    claims: Array.isArray(ar.claims) ? ar.claims : [],
    reasoningTrace: ar.reasoningTrace ?? "",
    ...(ar.citedUrls && ar.citedUrls.length > 0 ? { citedUrls: ar.citedUrls } : {}),
  };

  return {
    intent: derivePreferenceIntent(intent, {
      prompt: input.userPrompt ?? intent.rawCriteriaText,
      mode: input.kind,
    }),
    aiRecommendation,
  };
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m && m[1] ? m[1] : s).trim();
}

/**
 * URL mode — fetch the product page, let Opus 4.7 parse it, treat the
 * on-page product as a candidate. The user's preference profile (or the
 * inferred-from-prompt intent) scores it against alternatives.
 */
const URL_SYSTEM = `You parse a product page. Given the HTML+text of a page, extract the product and any marketing claims.
Return ONLY JSON (no prose, no markdown fences) with this shape:
{
  "intent": {"category": "<category name>", "criteria": [...], "rawCriteriaText": "<user words or empty>"},
  "aiRecommendation": {
    "host": "unknown",
    "pickedProduct": {"name": "<product name>", "brand": "<brand>", "price": <number>, "currency": "USD"},
    "claims": [{"attribute": "<spec name>", "statedValue": "<exact value on page>"}],
    "reasoningTrace": "<marketing copy, normalized>"
  }
}
If the user did not supply criteria, infer sensible defaults from the product category.`;

async function extractFromUrl(
  input: Extract<AuditInput, { kind: "url" }>,
  env: Env,
): Promise<{ intent: UserIntent; aiRecommendation: AIRecommendation }> {
  const retailer = parseRetailerUrl(input.url);
  const preferJina =
    retailer.retailer !== undefined &&
    ["amazon", "walmart", "target", "bestbuy"].includes(retailer.retailer);

  // B3: browser-like headers so Amazon/Best Buy/etc don't serve a captcha.
  let rawHtml = "";
  let fetchStatus: number | "error" = "error";
  if (!preferJina) {
    try {
      const res = await fetch(input.url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });
      fetchStatus = res.status;
      if (res.ok) {
        rawHtml = (await res.text()).slice(0, 400_000);
      } else {
        console.warn("[extract:url] fetch non-OK: status=%d", res.status);
      }
    } catch (e) {
      console.error("[extract:url] fetch failed:", (e as Error).message);
    }
  }
  console.log("[extract:url] fetch_status=%s html_bytes=%d", fetchStatus, rawHtml.length);

  // S3-W15 — structured parser runs first. When we get a confident parse,
  // skip the Opus round-trip and build the AIRecommendation deterministically.
  const { parseProduct, isConfident } = await import("./parsers/parse.js");
  const structured = parseProduct(rawHtml, input.url);
  if (isConfident(structured)) {
    console.log(
      "[extract:url] structured parse OK host=%s name=%s price=%s source=%s",
      structured.host ?? "?",
      structured.name,
      structured.price,
      structured.sources?.name ?? "?",
    );
    return buildFromStructured(structured, input);
  }

  const jinaStructured = await fetchStructuredViaJina(input.url).catch((err) => {
    console.warn("[extract:url] jina fallback failed:", (err as Error).message);
    return null;
  });
  if (jinaStructured?.name) {
    console.log(
      "[extract:url] jina parse OK name=%s price=%s",
      jinaStructured.name,
      jinaStructured.price,
    );
    return buildFromStructured(jinaStructured, input);
  }

  // Fallback: strip HTML → text, hand to Opus to interpret (previous behavior).
  const fetched = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 20_000);

  const hint = structured.name || structured.brand
    ? `PARTIAL STRUCTURED HINT:\n${JSON.stringify({
        name: structured.name,
        brand: structured.brand,
        price: structured.price,
        currency: structured.currency,
      })}\n\n`
    : "";

  const userContent = [
    {
      type: "text" as const,
      text: `URL: ${input.url}\n\n${input.userPrompt ? `USER CRITERIA: ${input.userPrompt}\n\n` : ""}${input.category ? `CATEGORY HINT: ${input.category}\n\n` : ""}${hint}PAGE CONTENT (truncated):\n${fetched || "(fetch returned empty and reader fallback found no product data; extract only identifiers visible in the URL and say when data is insufficient)"}`,
    },
  ];

  const { text } = await opusExtendedThinking(env, {
    system: URL_SYSTEM,
    user: userContent,
    maxOutputTokens: 6000,
    effort: "high",
  });
  return parseExtractJson(text, input.userPrompt, "url");
}

async function fetchStructuredViaJina(url: string): Promise<ProductParse | null> {
  const readerUrl = "https://r.jina.ai/" + url;
  const res = await fetch(readerUrl, {
    headers: {
      "User-Agent": "LensBot/1.0 (+https://lens-b1h.pages.dev)",
      Accept: "text/markdown, text/plain, */*",
    },
  });
  if (!res.ok) throw new Error(`jina-http-${res.status}`);
  const md = await res.text();
  if (!md.trim()) throw new Error("jina-empty");
  const page = parseJinaMarkdown(md);
  return pageExtractToProductParse(page, url);
}

function pageExtractToProductParse(page: PageExtract, url: string): ProductParse | null {
  const title = cleanupProductTitle(page.title);
  if (!title && page.priceCents == null) return null;
  const features = [
    ...(page.bullets ?? []),
    ...(page.availability ? [`Availability: ${page.availability}`] : []),
    ...(page.warranty ? [`Warranty: ${page.warranty}`] : []),
    ...(page.countryOfOrigin ? [`Country of origin: ${page.countryOfOrigin}`] : []),
    ...(page.model ? [`Model: ${page.model}`] : []),
    ...Object.entries(page.specs ?? {}).map(([k, v]) => `${k}: ${v}`),
  ].slice(0, 16);
  const host = safeHost(url);
  const parse: ProductParse = {
    ...(title ? { name: title } : {}),
    ...(page.brand ? { brand: page.brand } : {}),
    ...(page.priceCents != null ? { price: Math.round(page.priceCents) / 100 } : {}),
    currency: page.currency ?? "USD",
    ...(page.imageUrl ? { images: [page.imageUrl] } : {}),
    ...(features.length > 0 ? { features } : {}),
    ...(page.rating != null ? { rating: page.rating } : {}),
    ...(page.reviewCount != null ? { ratingCount: page.reviewCount } : {}),
    ...(page.model ? { mpn: page.model } : {}),
    ...(host ? { host } : {}),
    url,
    sources: {
      ...(title ? { name: "heuristic" as const } : {}),
      ...(page.brand ? { brand: "heuristic" as const } : {}),
      ...(page.priceCents != null ? { price: "heuristic" as const } : {}),
      ...(features.length > 0 ? { features: "heuristic" as const } : {}),
    },
  };
  return parse;
}

function cleanupProductTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const cleaned = title
    .replace(/^Title:\s*/i, "")
    .replace(/\s*[\|-]\s*(Amazon\.com|Walmart\.com|Target|Best Buy|Costco|Newegg).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 240) : undefined;
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Build a UserIntent + AIRecommendation directly from a structured parse, so
 * a reliable product page doesn't require an Opus round-trip on extraction.
 */
function buildFromStructured(
  structured: import("./parsers/types.js").ProductParse,
  input: Extract<AuditInput, { kind: "url" }>,
): { intent: UserIntent; aiRecommendation: AIRecommendation } {
  const intent = deriveUrlIntent(structured, input);
  const claims: AIRecommendation["claims"] = [];
  if (structured.features && structured.features.length > 0) {
    // B3: break each feature bullet into a proper attribute/statedValue pair.
    // Before, 6 bullets were all labeled "feature" with their full text as the
    // value — useless for downstream verify. Now we extract the claim's
    // attribute (first noun phrase before a colon / "with" / "—") and carry
    // the rest as the stated value, so verify can check each spec individually.
    for (const f of structured.features.slice(0, 10)) {
      const split =
        f.match(/^([^:—\-]{3,60}?):\s*(.+)$/) ??
        f.match(/^([^—\-]{3,60}?)\s*[—\-]\s*(.+)$/);
      if (split && split[1] && split[2]) {
        claims.push({ attribute: split[1].trim(), statedValue: split[2].trim().slice(0, 300) });
      } else {
        // No natural split — carry the full bullet as a self-describing claim.
        claims.push({ attribute: "feature", statedValue: f.slice(0, 300) });
      }
    }
  }
  if (structured.sku) claims.push({ attribute: "sku", statedValue: structured.sku });
  if (structured.rating !== undefined) {
    claims.push({ attribute: "rating", statedValue: String(structured.rating) });
  }
  if (structured.price !== undefined) {
    claims.push({
      attribute: "price",
      statedValue: `${structured.currency ?? "USD"} ${structured.price}`,
    });
  }
  // Scrub the user-pasted URL before carrying it forward — the user may have
  // pasted an affiliate-tagged URL (Amazon with ?tag=, Google AI Mode link, etc)
  // and Lens's non-negotiable (VISION_COMPLETE §13 #8) is no affiliate links ever.
  const parsedUrl = parseRetailerUrl(input.url);
  const cleanedUrl = scrubTrackingParams(parsedUrl.urlClean) ?? undefined;
  const aiRecommendation: AIRecommendation = {
    host: "unknown",
    pickedProduct: {
      name: structured.name ?? "(unknown product)",
      ...(structured.brand ? { brand: structured.brand } : {}),
      ...(structured.price !== undefined ? { price: structured.price } : {}),
      ...(structured.currency ? { currency: structured.currency } : {}),
      ...(cleanedUrl ? { url: cleanedUrl } : {}),
    },
    claims,
    reasoningTrace:
      structured.description ??
      `Structured extraction from ${structured.host ?? "page"} (source=${structured.sources?.name ?? "unknown"}).`,
    ...(cleanedUrl ? { sourceUrl: cleanedUrl } : {}),
  };
  return {
    intent: derivePreferenceIntent(intent, {
      prompt: input.userPrompt ?? intent.rawCriteriaText,
      mode: "url",
    }),
    aiRecommendation,
  };
}

function deriveUrlIntent(
  structured: import("./parsers/types.js").ProductParse,
  input: Extract<AuditInput, { kind: "url" }>,
): UserIntent {
  const category = input.category ?? inferCategoryFromName(structured.name ?? "") ?? "product";
  const promptCriteria = criteriaFromPrompt(input.userPrompt ?? "");
  const criteria =
    promptCriteria.length > 0
      ? promptCriteria
      : defaultCriteriaForCategory(category, structured);
  const total = criteria.reduce((sum, c) => sum + c.weight, 0) || 1;
  const budget = parseBudget(input.userPrompt ?? "");
  return {
    category,
    criteria: criteria.map((c) => ({ ...c, weight: c.weight / total })),
    rawCriteriaText: input.userPrompt ?? "",
    ...(budget ? { budget } : {}),
  };
}

type UrlCriterion = UserIntent["criteria"][number];

function criteriaFromPrompt(prompt: string): UrlCriterion[] {
  const text = prompt.toLowerCase();
  if (!text.trim()) return [];
  const hits: Array<UrlCriterion & { pos: number; boost: number }> = [];
  const add = (
    name: string,
    direction: UrlCriterion["direction"],
    patterns: RegExp[],
  ): void => {
    const positions = patterns
      .map((re) => {
        const m = re.exec(text);
        return m?.index ?? -1;
      })
      .filter((p) => p >= 0);
    if (positions.length === 0) return;
    const pos = Math.min(...positions);
    const window = text.slice(Math.max(0, pos - 35), Math.min(text.length, pos + 60));
    const boost = /\b(most|must|critical|important|matters?\s+(?:most|more|a lot)|priority|need)\b/.test(window)
      ? 0.45
      : /\b(prefer|care|want|looking for)\b/.test(window)
        ? 0.2
        : 0;
    hits.push({ name, direction, weight: 1, pos, boost, confidence: 0.85 });
  };

  add("price", "lower_is_better", [/\b(price|cheap|affordable|budget|cost|under|below|less than)\b/]);
  add("charging_performance", "higher_is_better", [/\b(charg(?:e|ing)|fast\s*charg|watt|magsafe|qi2?)\b/]);
  add("device_compatibility", "higher_is_better", [/\b(compatib|iphone|android|airpods?|apple watch|samsung|pixel|multi[-\s]?device|3[-\s]?in[-\s]?1)\b/]);
  add("portability", "higher_is_better", [/\b(portable|travel|compact|fold(?:ing|able)?|small|lightweight)\b/]);
  add("safety", "higher_is_better", [/\b(safe|overheat|heat|certified|ul\b|etl\b|qi2?|foreign object)\b/]);
  add("battery_life", "higher_is_better", [/\b(battery|runtime|hours|charge lasts?)\b/]);
  add("noise", "lower_is_better", [/\b(quiet|noise|loud|silent)\b/]);
  add("durability", "higher_is_better", [/\b(durable|sturdy|build|metal|steel|rugged|long[-\s]?lasting)\b/]);
  add("repairability", "higher_is_better", [/\b(repair|ifixit|parts|replaceable)\b/]);
  add("comfort", "higher_is_better", [/\b(comfort|ergonomic|all[-\s]?day)\b/]);
  add("privacy", "higher_is_better", [/\b(privacy|data|tracking|account required|app required)\b/]);
  add("energy_efficiency", "higher_is_better", [/\b(energy|efficient|power draw|electricity)\b/]);
  add("warranty", "higher_is_better", [/\b(warranty|return window|support)\b/]);
  add("review_quality", "higher_is_better", [/\b(review|rating|reliable|fake)\b/]);

  if (hits.length === 0) return [];
  hits.sort((a, b) => a.pos - b.pos);
  return hits.map((h, index) => {
    const base = Math.max(0.35, 1.25 - index * 0.12) + h.boost;
    const { pos: _pos, boost: _boost, ...criterion } = h;
    void _pos; void _boost;
    return { ...criterion, weight: base };
  });
}

function defaultCriteriaForCategory(
  category: string,
  structured: import("./parsers/types.js").ProductParse,
): UrlCriterion[] {
  const pack = findCategoryPack(category);
  if (pack?.body.criteria?.length) {
    return pack.body.criteria.slice(0, 6).map((c, index) => ({
      name: c.name,
      direction: c.direction,
      ...(typeof c.target === "string" || typeof c.target === "number" ? { target: c.target } : {}),
      weight: index === 0 ? 1.25 : 1,
      confidence: 0.65,
    }));
  }

  const c = category.toLowerCase();
  const defaults: Array<[RegExp, UrlCriterion[]]> = [
    [/\b(wireless\s+charg|chargers?|charging station|magsafe|power bank)\b/, [
      { name: "charging_performance", weight: 1.15, direction: "higher_is_better", confidence: 0.7 },
      { name: "device_compatibility", weight: 1.1, direction: "higher_is_better", confidence: 0.7 },
      { name: "safety", weight: 1, direction: "higher_is_better", confidence: 0.65 },
      { name: "portability", weight: 0.85, direction: "higher_is_better", confidence: 0.6 },
      { name: "price", weight: 0.8, direction: "lower_is_better", confidence: 0.65 },
    ]],
    [/\b(phone|smartphone)\b/, [
      { name: "camera_quality", weight: 1.1, direction: "higher_is_better", confidence: 0.6 },
      { name: "battery_life", weight: 1.05, direction: "higher_is_better", confidence: 0.65 },
      { name: "software_support_years", weight: 1, direction: "higher_is_better", confidence: 0.65 },
      { name: "price", weight: 0.85, direction: "lower_is_better", confidence: 0.65 },
    ]],
    [/\b(office chair|chair)\b/, [
      { name: "ergonomics", weight: 1.2, direction: "higher_is_better", confidence: 0.7 },
      { name: "adjustability", weight: 1.05, direction: "higher_is_better", confidence: 0.65 },
      { name: "durability", weight: 0.95, direction: "higher_is_better", confidence: 0.6 },
      { name: "price", weight: 0.8, direction: "lower_is_better", confidence: 0.65 },
    ]],
  ];
  for (const [re, criteria] of defaults) {
    if (re.test(c)) return criteria;
  }
  const featureCount = structured.features?.length ?? 0;
  return [
    { name: "overall_quality", weight: featureCount > 0 ? 1.1 : 1, direction: "higher_is_better", confidence: 0.55 },
    { name: "price", weight: 0.8, direction: "lower_is_better", confidence: 0.6 },
  ];
}

function parseBudget(prompt: string): UserIntent["budget"] | undefined {
  if (!prompt.trim()) return undefined;
  const patterns = [
    /\b(?:under|below|less than|up to|max(?:imum)?|budget(?: is)?|no more than)\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:or less|max|budget|cap)?/i,
  ];
  for (const re of patterns) {
    const m = prompt.match(re);
    if (!m?.[1]) continue;
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return { max: n, currency: "USD" };
  }
  return undefined;
}

function inferCategoryFromName(name: string): string | undefined {
  const n = name.toLowerCase();
  const hits: Array<[RegExp, string]> = [
    [/\bespresso\b|\bbarista\b/, "espresso machines"],
    [/\b(wireless\s+charg|charging station|magsafe|qi2?|power bank|phone charger|3[-\s]?in[-\s]?1 charger)\b/, "wireless chargers"],
    [/\blaptop\b|\bmacbook\b|\bthinkpad\b|\bnotebook\b/, "laptops"],
    [/\biphone\b|\bgalaxy\b|\bpixel\b|\bsmartphone\b|\bcell phone\b/, "smartphones"],
    [/\bheadphone\b|\bearbuds?\b|\bin-?ears?\b/, "headphones"],
    [/\btv\b|\bsmart television\b|\boled\b|\bqled\b/, "televisions"],
    [/\bvacuum\b|\broborock\b|\bdyson\b/, "vacuums"],
    [/\bblender\b|\bvitamix\b|\bninja\b/, "blenders"],
    [/\bcamera\b|\bdslr\b|\bmirrorless\b/, "cameras"],
    [/\boffice chair\b|\bergonomic chair\b/, "office chairs"],
    [/\bmattress\b|\bbed-in-a-box\b/, "mattresses"],
    [/\bcarry[-\s]?on\b|\bluggage\b|\bsuitcase\b/, "carry-on luggage"],
    [/\belectric toothbrush\b|\btoothbrush\b/, "electric toothbrushes"],
    [/\bair purifier\b|\bhepa\b/, "air purifiers"],
    [/\bmonitor\b|\bdisplay\b/, "monitors"],
    [/\bmechanical keyboard\b|\bkeyboard\b/, "mechanical keyboards"],
  ];
  for (const [re, slug] of hits) if (re.test(n)) return slug;
  return undefined;
}

/**
 * Photo mode — phone camera photo of a product. Opus 4.7 vision reads the
 * product label, box, shelf tag, etc.
 */
const PHOTO_SYSTEM = `You identify a product from a phone camera photo. The photo may show the product itself, its packaging, a shelf tag, or a retail display.
Return ONLY JSON (no prose, no markdown fences) matching the URL-mode schema (intent + aiRecommendation).
Prefer conservative extraction — mark spec claims as unverifiable if you cannot read them.`;

async function extractFromPhoto(
  input: Extract<AuditInput, { kind: "photo" }>,
  env: Env,
): Promise<{ intent: UserIntent; aiRecommendation: AIRecommendation }> {
  const userContent = [
    {
      type: "image" as const,
      source: {
        type: "base64" as const,
        // Judge P0-1 (2026-04-24): drive media_type from imageMime (phone
        // cameras default to jpeg; png is legacy). Claude vision rejects
        // HEIC so we don't accept it upstream in the composer.
        media_type: (input.imageMime ?? "image/jpeg") as
          | "image/png"
          | "image/jpeg"
          | "image/webp"
          | "image/gif",
        data: input.imageBase64,
      },
    },
    {
      type: "text" as const,
      text: `Identify the product in this photo.${input.userPrompt ? ` User context: ${input.userPrompt}.` : ""}${input.category ? ` Category hint: ${input.category}.` : ""}`,
    },
  ];

  const { text } = await opusExtendedThinking(env, {
    system: PHOTO_SYSTEM,
    user: userContent,
    maxOutputTokens: 4000,
    effort: "high",
  });
  return parseExtractJson(text, input.userPrompt, "photo");
}

function parseExtractJson(
  text: string,
  userPromptFallback?: string,
  mode: PreferenceInferenceOptions["mode"] = "api",
): { intent: UserIntent; aiRecommendation: AIRecommendation } {
  const json = stripFences(text);
  let parsed: { intent?: Partial<UserIntent>; aiRecommendation?: Partial<AIRecommendation> };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`URL/photo extract returned non-JSON: ${json.slice(0, 400)}`);
  }
  // Coerce Opus-freelanced criteria. Opus sometimes returns:
  //   ["wireless charger", "fast charging", "portable"]
  // instead of:
  //   [{name: "wireless charger", weight: 0.33, direction: "higher_is_better"}, ...]
  // Spreading a bare string with {...c, weight: X} produces a character-indexed
  // object — a bug the user caught on the live Anker audit. Normalize here.
  const normalizeCriterion = (c: unknown): { name: string; weight: number; direction: "higher_is_better" | "lower_is_better" | "target" | "binary"; target?: string | number; confidence?: number } | null => {
    if (typeof c === "string") {
      const name = c.trim();
      return name.length > 0
        ? { name, weight: 1, direction: "higher_is_better" as const, confidence: 0.5 }
        : null;
    }
    // Judge P2-7: nested arrays (e.g. Opus returning [["wireless","charger"], "fast"])
    // would silently drop without this warning. Surface for observability.
    if (Array.isArray(c)) {
      console.warn("[extract] dropped nested-array criterion: %s", JSON.stringify(c).slice(0, 100));
      return null;
    }
    if (!c || typeof c !== "object") return null;
    const obj = c as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (name.length === 0) return null;
    const rawWeight = obj.weight;
    const weight =
      typeof rawWeight === "number" && Number.isFinite(rawWeight)
        ? rawWeight
        : typeof rawWeight === "string"
          ? Number.parseFloat(rawWeight) || 0
          : 1;
    const rawDir = typeof obj.direction === "string" ? obj.direction : "higher_is_better";
    const dir: "higher_is_better" | "lower_is_better" | "target" | "binary" =
      rawDir === "lower_is_better" || rawDir === "target" || rawDir === "binary"
        ? rawDir
        : "higher_is_better";
    const target = typeof obj.target === "number" || typeof obj.target === "string" ? obj.target : undefined;
    const rawConfidence = obj.confidence;
    const confidence =
      typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(1, rawConfidence))
        : typeof rawConfidence === "string"
          ? Math.max(0, Math.min(1, Number.parseFloat(rawConfidence) || 1))
          : 1;
    const base: { name: string; weight: number; direction: typeof dir; target?: string | number; confidence: number } = { name, weight, direction: dir, confidence };
    if (target !== undefined) base.target = target;
    return base;
  };
  const rawCriteria = Array.isArray(parsed.intent?.criteria) ? parsed.intent.criteria : [];
  const normalized = rawCriteria.map(normalizeCriterion).filter(
    (c): c is { name: string; weight: number; direction: "higher_is_better" | "lower_is_better" | "target" | "binary"; target?: string | number } => c !== null,
  );
  const intent: UserIntent = {
    category: parsed.intent?.category ?? "product",
    criteria:
      normalized.length > 0
        ? normalized
        : [{ name: "overall_quality", weight: 1, direction: "higher_is_better" }],
    rawCriteriaText: parsed.intent?.rawCriteriaText ?? userPromptFallback ?? "",
    ...(parsed.intent?.budget ? { budget: parsed.intent.budget } : {}),
  };
  const total = intent.criteria.reduce((s, c) => s + (c.weight ?? 0), 0) || 1;
  intent.criteria = intent.criteria.map((c) => ({ ...c, weight: (c.weight ?? 0) / total }));

  const ar = parsed.aiRecommendation ?? {};
  const aiRecommendation: AIRecommendation = {
    host: "unknown",
    pickedProduct: {
      name: ar.pickedProduct?.name ?? "Unknown product",
      ...(ar.pickedProduct?.brand ? { brand: ar.pickedProduct.brand } : {}),
      ...(ar.pickedProduct?.price !== undefined ? { price: ar.pickedProduct.price } : {}),
      ...(ar.pickedProduct?.currency ? { currency: ar.pickedProduct.currency } : {}),
    },
    claims: Array.isArray(ar.claims) ? ar.claims : [],
    reasoningTrace: ar.reasoningTrace ?? "",
  };
  return {
    intent: derivePreferenceIntent(intent, {
      prompt: userPromptFallback ?? intent.rawCriteriaText,
      mode,
    }),
    aiRecommendation,
  };
}

/**
 * Job 1 primary mode: extract a UserIntent from a plain natural-language query
 * with no AI assistant output to audit. Returns a synthetic aiRecommendation
 * marked host="unknown" with empty claims — downstream stages render accordingly.
 */
const QUERY_SYSTEM = `You parse a shopping intent from a plain natural-language user query. Return ONLY the "intent" object (the same schema used in the paste audit, no aiRecommendation).

REQUIREMENTS:
- "category" MUST be a concrete short noun phrase describing the product type (e.g. "espresso machine", "laptop", "headphones", "robot vacuum", "wireless charger"). Never "product", "item", "thing", "gadget", "device" alone — always give the specific category.
- Derive criteria weights from ORDER and EMPHASIS in the user's language when not explicit. Earlier + emphasized criteria get more weight. Normalize weights to sum to 1.
- For every criterion include "confidence": <0..1> — your self-assessed confidence the criterion reflects the user's explicit words (1.0 = user literally said this word; 0.4-0.5 = inferred from vague adjective like "fast", "nice"; 0.8 = strongly implied by context).
- When user says "price matters" or "cheap" or "under $X", add a criterion {"name":"price","direction":"lower_is_better","weight":...,"confidence":1.0}.
- When user says "X matters most" or "X matters a lot", that criterion gets the LARGEST weight.
- If a budget is implied ("under $400"), include "budget":{"max":400,"currency":"USD"}.

Return a single JSON object {"intent": {...}} — no prose, no markdown fences.`;

async function extractQueryOnly(
  input: Extract<AuditInput, { kind: "query" }>,
  env: Env,
): Promise<{ intent: UserIntent; aiRecommendation: AIRecommendation }> {
  const categoryHint = input.category ? ` Category hint: ${input.category}.` : "";

  // Two-pass: first pass to identify category, second to apply pack criteria template.
  const firstRes = await opusExtendedThinking(env, {
    system: QUERY_SYSTEM,
    user: `USER QUERY: ${input.userPrompt}${categoryHint}`,
    maxOutputTokens: 2500,
    effort: "medium",
  });
  const firstJson = stripFences(firstRes.text);
  let firstParsed: { intent?: { category?: string } };
  try { firstParsed = JSON.parse(firstJson); } catch { firstParsed = {}; }

  const categoryGuess = input.category ?? firstParsed.intent?.category;
  const categoryPack = categoryGuess ? findCategoryPack(categoryGuess) : null;
  console.log("[extract:query] category_guess=%s pack_hit=%s", categoryGuess, categoryPack?.slug ?? "none");

  const text = categoryPack
    ? (
        await opusExtendedThinking(env, {
          system: QUERY_SYSTEM + "\n\n" + categoryCriteriaPrompt(categoryPack),
          user: `USER QUERY: ${input.userPrompt}${categoryHint}`,
          maxOutputTokens: 2500,
          effort: "medium",
        })
      ).text
    : firstRes.text;

  const json = stripFences(text);
  let parsed: { intent?: Partial<UserIntent> };
  try { parsed = JSON.parse(json); } catch {
    throw new Error(`extractQueryOnly returned non-JSON: ${json.slice(0, 400)}`);
  }

  const intent: UserIntent = {
    category: parsed.intent?.category ?? "product",
    criteria:
      parsed.intent?.criteria && parsed.intent.criteria.length > 0
        ? parsed.intent.criteria
        : [{ name: "overall_quality", weight: 1, direction: "higher_is_better" }],
    rawCriteriaText: parsed.intent?.rawCriteriaText ?? input.userPrompt,
    ...(parsed.intent?.budget ? { budget: parsed.intent.budget } : {}),
  };
  const total = intent.criteria.reduce((s, c) => s + (c.weight ?? 0), 0) || 1;
  intent.criteria = intent.criteria.map((c) => ({ ...c, weight: (c.weight ?? 0) / total }));

  // Synthetic aiRecommendation — Job 1 has no AI to audit.
  const aiRecommendation: AIRecommendation = {
    host: input.source ?? "unknown",
    pickedProduct: { name: "(no AI recommendation — user query only)" },
    claims: [],
    reasoningTrace: "",
  };
  return {
    intent: derivePreferenceIntent(intent, {
      prompt: input.userPrompt,
      mode: "query",
    }),
    aiRecommendation,
  };
}
