import type { AuditInput, UserIntent, AIRecommendation } from "@lens/shared";
import type { Env } from "./index.js";
import { opusExtendedThinking } from "./anthropic.js";

const SYSTEM_PROMPT = `You are Lens, an auditor of AI shopping recommendations. Your first job is decomposition:
given a pasted answer from an AI assistant (ChatGPT, Claude, Gemini, or Amazon Rufus) and optionally the user's
original prompt, produce two structured outputs:

1. USER INTENT — what the user was trying to buy, which criteria they cared about, and in what direction.
   Normalize criteria to weights that sum to 1. If the user did not assign weights explicitly, infer them from
   the order and emphasis in their language (first-mentioned and emphatically-phrased criteria get more weight).

2. AI RECOMMENDATION — what the AI picked, what attribute claims it made to justify the pick, and the
   reasoning prose, normalized. Separate factual claims (e.g. "15 bar pressure") from evaluative claims
   (e.g. "great value"). Only extract factual claims.

Return a single JSON object with fields: "intent" and "aiRecommendation". Do not add prose outside the JSON.
The JSON object is the only output.`;

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
            source: { type: "base64" as const, media_type: "image/png" as const, data: input.imageBase64 },
          },
          {
            type: "text" as const,
            text: `SCREENSHOT of AI assistant answer (source=${input.source}).${input.userPrompt ? ` User's original prompt was: ${input.userPrompt}` : ""} Extract intent and recommendation.`,
          },
        ];

  const { text } = await opusExtendedThinking(env, {
    system: SYSTEM_PROMPT,
    user: userContent,
    maxOutputTokens: 3000,
    thinkingBudget: 3000,
  });

  // The model is instructed to return pure JSON. If it wraps in fences, strip them.
  const json = stripFences(text);
  const parsed = JSON.parse(json) as { intent: UserIntent; aiRecommendation: AIRecommendation };

  // Normalize criterion weights to sum to 1.
  const total = parsed.intent.criteria.reduce((s, c) => s + c.weight, 0) || 1;
  parsed.intent.criteria = parsed.intent.criteria.map((c) => ({ ...c, weight: c.weight / total }));
  parsed.aiRecommendation.host = input.source;
  return parsed;
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m && m[1] ? m[1] : s).trim();
}
