import type { AuditInput, UserIntent, AIRecommendation } from "@lens/shared";
import type { Env } from "./index.js";
import { opusExtendedThinking } from "./anthropic.js";
import { findCategoryPack } from "./packs/registry.js";
import { categoryCriteriaPrompt } from "./packs/prompter.js";

const SYSTEM_PROMPT = `You audit AI shopping recommendations. Decompose the pasted assistant answer into two JSON objects.

Return a single JSON object (no prose, no markdown fences) with exactly these top-level keys:

{
  "intent": {
    "category": "<short noun phrase, e.g. 'espresso machine' or 'laptop'>",
    "criteria": [
      { "name": "<criterion>", "weight": <0..1>, "direction": "higher_is_better"|"lower_is_better"|"target"|"binary", "target": <optional value> }
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
              media_type: "image/png" as const,
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

  return { intent, aiRecommendation };
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
  // B3: browser-like headers so Amazon/Best Buy/etc don't serve a captcha.
  let rawHtml = "";
  let fetchStatus: number | "error" = "error";
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
      text: `URL: ${input.url}\n\n${input.userPrompt ? `USER CRITERIA: ${input.userPrompt}\n\n` : ""}${input.category ? `CATEGORY HINT: ${input.category}\n\n` : ""}${hint}PAGE CONTENT (truncated):\n${fetched || "(fetch returned empty; extract product from the URL itself if possible)"}`,
    },
  ];

  const { text } = await opusExtendedThinking(env, {
    system: URL_SYSTEM,
    user: userContent,
    maxOutputTokens: 6000,
    effort: "high",
  });
  return parseExtractJson(text, input.userPrompt);
}

/**
 * Build a UserIntent + AIRecommendation directly from a structured parse, so
 * a reliable product page doesn't require an Opus round-trip on extraction.
 */
function buildFromStructured(
  structured: import("./parsers/types.js").ProductParse,
  input: Extract<AuditInput, { kind: "url" }>,
): { intent: UserIntent; aiRecommendation: AIRecommendation } {
  const intent: UserIntent = {
    category: input.category ?? inferCategoryFromName(structured.name ?? "") ?? "product",
    criteria: [
      { name: "price", weight: 0.4, direction: "lower_is_better" },
      { name: "overall_quality", weight: 0.6, direction: "higher_is_better" },
    ],
    rawCriteriaText: input.userPrompt ?? "",
  };
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
  const aiRecommendation: AIRecommendation = {
    host: "unknown",
    pickedProduct: {
      name: structured.name ?? "(unknown product)",
      ...(structured.brand ? { brand: structured.brand } : {}),
      ...(structured.price !== undefined ? { price: structured.price } : {}),
      ...(structured.currency ? { currency: structured.currency } : {}),
      url: input.url,
    },
    claims,
    reasoningTrace:
      structured.description ??
      `Structured extraction from ${structured.host ?? "page"} (source=${structured.sources?.name ?? "unknown"}).`,
    sourceUrl: input.url,
  };
  return { intent, aiRecommendation };
}

function inferCategoryFromName(name: string): string | undefined {
  const n = name.toLowerCase();
  const hits: Array<[RegExp, string]> = [
    [/\bespresso\b|\bbarista\b/, "espresso machines"],
    [/\blaptop\b|\bmacbook\b|\bthinkpad\b|\bnotebook\b/, "laptops"],
    [/\bheadphone\b|\bearbuds?\b|\bin-?ears?\b/, "headphones"],
    [/\btv\b|\bsmart television\b|\boled\b|\bqled\b/, "televisions"],
    [/\bvacuum\b|\broborock\b|\bdyson\b/, "vacuums"],
    [/\bblender\b|\bvitamix\b|\bninja\b/, "blenders"],
    [/\bcamera\b|\bdslr\b|\bmirrorless\b/, "cameras"],
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
      source: { type: "base64" as const, media_type: "image/png" as const, data: input.imageBase64 },
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
  return parseExtractJson(text, input.userPrompt);
}

function parseExtractJson(
  text: string,
  userPromptFallback?: string,
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
  const normalizeCriterion = (c: unknown): { name: string; weight: number; direction: "higher_is_better" | "lower_is_better" | "target" | "binary"; target?: string | number } | null => {
    if (typeof c === "string") {
      const name = c.trim();
      return name.length > 0
        ? { name, weight: 1, direction: "higher_is_better" as const }
        : null;
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
    return target !== undefined ? { name, weight, direction: dir, target } : { name, weight, direction: dir };
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
  return { intent, aiRecommendation };
}

/**
 * Job 1 primary mode: extract a UserIntent from a plain natural-language query
 * with no AI assistant output to audit. Returns a synthetic aiRecommendation
 * marked host="unknown" with empty claims — downstream stages render accordingly.
 */
const QUERY_SYSTEM = `You parse a shopping intent from a plain natural-language user query. Return ONLY the "intent" object (the same schema used in the paste audit, no aiRecommendation). Derive criteria weights from ORDER and EMPHASIS in the user's language when not explicit. Normalize weights to sum to 1. Return a single JSON object {"intent": {...}} — no prose, no markdown fences.`;

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
  return { intent, aiRecommendation };
}
