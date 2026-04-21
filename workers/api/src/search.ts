import type { Candidate, UserIntent } from "@lens/shared";
import type { Env } from "./index.js";
import { OPUS_4_7, client } from "./anthropic.js";

/**
 * Live web search for candidate products using Opus 4.7's web search tool.
 * Returns candidates with parsed spec sheets, ready for claim verification + ranking.
 *
 * Day 1 strategy: use anthropic web_search server-side tool (if available on Opus 4.7).
 * Fallback: Opus 4.7 is given the live-web-search tool definition and decides its own queries.
 */
export async function searchCandidates(intent: UserIntent, env: Env): Promise<Candidate[]> {
  const anthropic = client(env);

  const system = `You are a product research agent. Your job is to find real, currently-available products
that match the user's category and criteria. Use the web search tool liberally — aim for 10-20 real
candidates from reputable retailers (manufacturer sites, Amazon, Best Buy, B&H, etc.). For each candidate,
return: name, brand, price (USD), product URL, and a complete specs object covering every criterion the
user mentioned. If a spec is not stated on the page, leave it out — do not fabricate.

Return a single JSON array named "candidates". Each entry matches the Candidate type. Do not include
utilityScore, attributeScores, or utilityBreakdown — those are computed later. No prose outside the JSON.`;

  const userText = [
    `CATEGORY: ${intent.category}`,
    `CRITERIA: ${intent.criteria.map((c) => `${c.name} (${c.direction}, weight ${c.weight.toFixed(2)})`).join(", ")}`,
    intent.budget
      ? `BUDGET: ${intent.budget.min ?? 0}–${intent.budget.max ?? "∞"} ${intent.budget.currency}`
      : "",
    "",
    "Return 10-20 real candidates as JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await anthropic.messages.create({
    model: OPUS_4_7,
    max_tokens: 8000,
    tools: [
      {
        // NOTE: exact tool name to be confirmed from Opus 4.7 release notes / kickoff.
        // Anthropic's server-side web search tool may be e.g. "web_search_20250305".
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 8,
      } as any,
    ],
    system,
    messages: [{ role: "user", content: userText }],
  } as any);

  let text = "";
  for (const block of res.content) {
    if (block.type === "text") text += block.text;
  }

  const json = stripFences(text);
  const parsed = JSON.parse(json) as { candidates: Candidate[] };
  // Fill in defaults for the fields the prompt told the model to omit.
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
  return (m ? m[1] : s).trim();
}
