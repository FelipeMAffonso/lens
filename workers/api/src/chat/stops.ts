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

export function isReadyToGenerate(turns: ChatTurn[]): boolean {
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
