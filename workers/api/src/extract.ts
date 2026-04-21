import type { AuditInput, UserIntent, AIRecommendation } from "@lens/shared";
import type { Env } from "./index.js";
import { opusExtendedThinking } from "./anthropic.js";

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

  const { text } = await opusExtendedThinking(env, {
    system: SYSTEM_PROMPT,
    user: userContent,
    maxOutputTokens: 6000,
    effort: "high",
  });

  const json = stripFences(text);
  console.log("[extract] raw_text_length=%d first_400=%s", text.length, text.slice(0, 400));

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
