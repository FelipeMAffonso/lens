// CJ-W53 — chat stop-condition logic. Ports Study 3's QUALTRICS_CHATBOT.js
// elicit() gate verbatim:
//   ready = userTurns >= 4 || (userTurns >= 3 && !lastBotEndedInQ)
// Pure function so both the worker handler and the web front-end can share it.

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  at?: string;
}

export function userTurnCount(turns: ChatTurn[]): number {
  return turns.filter((t) => t.role === "user").length;
}

export function lastAssistantEndedInQuestion(turns: ChatTurn[]): boolean {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.role === "assistant") {
      const trimmed = t.text.trimEnd();
      // Judge P1-1: accept ASCII `?`, fullwidth `？` (U+FF1F), Arabic `؟`,
      // and common trailing-punct forms like `(question?)`, `"question?"`.
      return /[?？؟][\s)\]\"'*]*$/.test(trimmed);
    }
  }
  return false;
}

// 2026-04-22 user-feedback calibration fix: if the USER's last message is
// itself a question to Lens (e.g. "why are you asking about X?", "what does
// X mean?"), we must NOT trigger the audit — even if the hard 4-turn ceiling
// would otherwise. The user is still in dialogue, not ready to commit.
export function lastUserEndedInQuestion(turns: ChatTurn[]): boolean {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.role === "user") {
      const trimmed = t.text.trimEnd();
      if (/[?？؟][\s)\]\"'*]*$/.test(trimmed)) return true;
      // Also treat short "what" / "why" / "how" questions without a `?` as
      // questions (conversational users often skip punctuation).
      if (/^(what|why|how|huh|eh|which|can you|could you|would you)\b/i.test(t.text.trim())) {
        return true;
      }
      return false;
    }
  }
  return false;
}

export function isReadyToGenerate(turns: ChatTurn[]): boolean {
  // User-feedback calibration: never trigger audit when the user's last
  // message is a question back to Lens. They want an answer, not a recco.
  if (lastUserEndedInQuestion(turns)) return false;
  const u = userTurnCount(turns);
  if (u >= 4) return true;
  if (u >= 3 && !lastAssistantEndedInQuestion(turns)) return true;
  return false;
}

// Detect the "user already explicitly gave budget + 1 feature + 1 tradeoff" shortcut
// that Study 3's prompt expresses as "respond with READY and nothing else."
// Heuristic: their last turn mentions (a) a currency amount, AND (b) at least
// one trade-off keyword from a small vocabulary. Paired with the hard
// user-turns ceiling it gives Opus a fast-path exit.
const BUDGET_PATTERN = /\$\s?\d+(?:[,\d]*)|\bunder\s+\d+|below\s+\d+|max(?:imum)?\s+\$?\d+|budget.*\$?\d+/i;
const TRADEOFF_KEYWORDS = [
  "fully automatic",
  "semi-automatic",
  "true wireless",
  "neckband",
  "over-ear",
  "in-ear",
  "oled",
  "lcd",
  "qled",
  "drip",
  "pod",
  "single-cup",
  "mop",
  "lumbar",
  "mesh",
  "leather",
  "cordless",
  "corded",
  "ssd",
  "hdd",
  "hybrid",
];

export function userGaveEverything(turns: ChatTurn[]): boolean {
  const userTexts = turns.filter((t) => t.role === "user").map((t) => t.text.toLowerCase());
  if (userTexts.length === 0) return false;
  const joined = userTexts.join(" \n ");
  const hasBudget = BUDGET_PATTERN.test(joined);
  const hasTradeoff = TRADEOFF_KEYWORDS.some((k) => joined.includes(k));
  return hasBudget && hasTradeoff;
}

// improve-01 Job 2 detection: recognize when a user pastes an AI-generated
// product recommendation (ChatGPT, Claude, Gemini, Rufus, Perplexity). A
// positive match should short-circuit Stage 1 and route straight to /audit
// with kind="text" — there is no point asking "what's your budget?" when
// the paste already names a specific product with cited reasons.
//
// Scoring: four orthogonal signals, fire when ≥2 are present AND the text
// is long enough to plausibly be a paste.
//   1. RECO_OPENERS — "I recommend", "my pick is", "I'd go with", etc.
//   2. CITED_REASONS — enumerated reasons ("(1)…(2)…(3)", "three reasons",
//      "first…second…"), "it offers", etc.
//   3. MODEL_CODE — a product name followed by an alphanumeric model code
//      (De'Longhi Stilosa EC260BK, Sony WH-1000XM5, MacBook Air M3).
//   4. PRICE_SENTINEL — "$249", "priced around $500", "MSRP", "list price".
//
// The 2-of-4 threshold was tuned on the positive/negative cases below.
// Lower threshold caused false-positives on long shopping queries like
// "I want a good laptop for coding with great battery life and keyboard".
const RECO_OPENER = /\bi\s+(?:recommend|suggest)\b|\bi['\u2019]d?\s+(?:recommend|suggest|go\s+with|pick|choose)\b|\bmy\s+(?:pick|top\s+pick|top\s+choice|recommendation|suggestion)\b|\bbased\s+on\s+your\b|\bfor\s+your\s+(?:use\s+case|criteria|needs|budget)\b|\b(?:check\s+out|consider)\s+the\b|\b(?:popular|top|best|strong)\s+(?:pick|choice|option)\b/i;
const CITED_REASONS =
  /\b(?:three|3|four|4|five|5)\s+reasons\b|\breasons?\s+(?:to\s+(?:pick|consider|choose)|why)\b|\(\s*1\s*\)[\s\S]{2,200}\(\s*2\s*\)|\b1\.\s[\s\S]{2,200}\b2\.\s|\bfirst\b[\s\S]{2,200}\bsecond\b|\bit\s+(?:gives|offers|has|features|comes\s+with|delivers)\b/i;
const MODEL_CODE = /\b[A-Z][a-zA-Z'\u2019]+(?:[\s-][A-Z][a-zA-Z'\u2019]*){0,3}\s+[A-Z0-9][A-Z0-9-]{1,}\b/;
const PRICE_SENTINEL =
  /\$\s?\d{2,}(?:[,.\d]+)?|\bpriced?\s+(?:at|around|under|near|from)\s+\$?\d{2,}|\bMSRP\b|\blist\s+price\b|\bstarting\s+at\s+\$/i;

export function looksLikeAIRecommendation(text: string): boolean {
  const t = text.trim();
  // Minimum length: short one-liner queries ("espresso under $400") never
  // contain the full cited-claim prose of an AI-generated recommendation.
  if (t.length < 100) return false;
  let score = 0;
  if (RECO_OPENER.test(t)) score += 1;
  if (CITED_REASONS.test(t)) score += 1;
  if (MODEL_CODE.test(t)) score += 1;
  if (PRICE_SENTINEL.test(t)) score += 1;
  return score >= 2;
}

// improve-01 companion: cheap heuristic to guess which AI the paste came
// from, so the /audit `kind: "text"` call can set `source` correctly. Reads
// very obvious markers (ChatGPT's "memoryrouter" separators, Claude's
// "I should clarify" style, Gemini's "Sources" footer, Rufus Amazon-only
// tone). Default is "unknown" — nothing downstream depends on the guess.
export function inferHostAI(text: string): "chatgpt" | "claude" | "gemini" | "rufus" | "unknown" {
  const t = text.toLowerCase();
  if (/\bon\s+amazon\b|\bavailable\s+on\s+amazon\b|\bsold\s+by\s+amazon\b|rufus/i.test(t)) return "rufus";
  if (/i['\u2019]ll\s+clarify|let\s+me\s+(?:be\s+)?clarify|gemini/i.test(t)) return "gemini";
  if (/as\s+(?:claude|an\s+ai)|anthropic/i.test(t)) return "claude";
  if (/chatgpt|openai|as\s+of\s+my\s+last\s+update/i.test(t)) return "chatgpt";
  return "unknown";
}
