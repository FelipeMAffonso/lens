import type { AIRecommendation, Candidate, Claim, UserIntent } from "@lens/shared";
import type { Env } from "./index.js";
import { opusExtendedThinking } from "./anthropic.js";

const SYSTEM = `You are a claim verifier. Given:
  (a) the product an AI assistant recommended, with its cited attribute claims, and
  (b) a catalog of real candidate products with spec sheets,
evaluate each claim. For each claim return: verdict ("true" | "false" | "misleading" | "unverifiable"),
optionally evidenceUrl + evidenceSnippet + note.

"misleading" covers cases where the claim is technically true but selectively framed to favor the AI's pick
when comparable alternatives outperform on the same axis. Be rigorous. Cite the product page URL when you
can. Return a JSON object with a "claims" array; no prose outside the JSON.`;

export async function verifyClaims(
  rec: AIRecommendation,
  candidates: Candidate[],
  _intent: UserIntent,
  env: Env,
): Promise<Claim[]> {
  const aiPick = candidates.find(
    (c) =>
      c.name.toLowerCase().includes(rec.pickedProduct.name.toLowerCase()) ||
      rec.pickedProduct.name.toLowerCase().includes(c.name.toLowerCase()),
  );

  const userText = [
    `AI PICK: ${rec.pickedProduct.brand ?? ""} ${rec.pickedProduct.name}`.trim(),
    aiPick ? `AI PICK SPEC SHEET: ${JSON.stringify(aiPick.specs)}` : "AI PICK SPEC SHEET: (not in catalog)",
    "",
    `CLAIMS TO VERIFY:\n${rec.claims.map((c, i) => `${i + 1}. ${c.attribute} = ${c.statedValue}`).join("\n")}`,
    "",
    `CATALOG (${candidates.length} candidates) — includes specs for comparison:`,
    JSON.stringify(candidates.slice(0, 20).map((c) => ({ name: c.name, brand: c.brand, price: c.price, url: c.url, specs: c.specs }))),
  ].join("\n");

  const { text } = await opusExtendedThinking(env, {
    system: SYSTEM,
    user: userText,
    maxOutputTokens: 4000,
    thinkingBudget: 4000,
  });
  const json = stripFences(text);
  const parsed = JSON.parse(json) as { claims: Claim[] };
  return parsed.claims;
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}
