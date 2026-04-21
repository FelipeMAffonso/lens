import type { AIRecommendation, Candidate, Claim, UserIntent } from "@lens/shared";
import type { Env } from "./index.js";
import { opusExtendedThinking } from "./anthropic.js";

const SYSTEM = `You are a claim verifier. Given:
  (a) the product an AI assistant recommended, with its cited attribute claims, and
  (b) a catalog of real candidate products with spec sheets,
evaluate each claim.

For EACH input claim return a JSON object with ALL of these fields echoed back, plus a verdict:
  {
    "attribute": "<exact attribute from the input>",
    "statedValue": "<exact statedValue from the input>",
    "verdict": "true" | "false" | "misleading" | "unverifiable",
    "evidenceUrl": "<optional product page URL that proves/disproves>",
    "evidenceSnippet": "<optional passage that was checked>",
    "note": "<short human-readable explanation (< 120 chars)>"
  }

"misleading" covers cases where the claim is technically true but selectively framed to favor the AI's pick
when comparable alternatives outperform on the same axis. Be rigorous. Cite the product page URL when you
can. Return a JSON object with a "claims" array of exactly one entry per input claim, in order. No prose
outside the JSON. No markdown fences.`;

export async function verifyClaims(
  rec: AIRecommendation,
  candidates: Candidate[],
  _intent: UserIntent,
  env: Env,
): Promise<Claim[]> {
  if (!rec.claims || rec.claims.length === 0) {
    console.log("[verify] no claims to verify; returning empty");
    return [];
  }

  const safeCandidates = candidates.filter((c): c is Candidate => !!c && typeof c.name === "string");
  const pickName = rec.pickedProduct?.name?.toLowerCase() ?? "";

  const aiPick = pickName
    ? safeCandidates.find(
        (c) => c.name.toLowerCase().includes(pickName) || pickName.includes(c.name.toLowerCase()),
      )
    : undefined;

  const userText = [
    `AI PICK: ${rec.pickedProduct?.brand ?? ""} ${rec.pickedProduct?.name ?? "(unknown)"}`.trim(),
    aiPick
      ? `AI PICK SPEC SHEET: ${JSON.stringify(aiPick.specs)}`
      : "AI PICK SPEC SHEET: (not in catalog — cross-reference the candidate specs below)",
    "",
    `CLAIMS TO VERIFY:\n${rec.claims.map((c, i) => `${i + 1}. ${c.attribute} = ${c.statedValue}`).join("\n")}`,
    "",
    `CATALOG (${safeCandidates.length} candidates) — includes specs for comparison:`,
    JSON.stringify(
      safeCandidates
        .slice(0, 20)
        .map((c) => ({ name: c.name, brand: c.brand, price: c.price, url: c.url, specs: c.specs })),
    ),
  ].join("\n");

  const { text } = await opusExtendedThinking(env, {
    system: SYSTEM,
    user: userText,
    maxOutputTokens: 8000,
    effort: "high",
  });
  const json = stripFences(text);
  let parsed: { claims?: Claim[] };
  try {
    parsed = JSON.parse(json);
  } catch {
    console.error("[verify] non-JSON response; first 300 chars:", json.slice(0, 300));
    return [];
  }
  return Array.isArray(parsed.claims) ? parsed.claims : [];
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m && m[1] ? m[1] : s).trim();
}
