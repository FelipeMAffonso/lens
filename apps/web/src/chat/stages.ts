// CJ-W53 — front-end mirror of the Study 3 stop gate. Pure logic. Keeps
// the chat UI responsive while the worker's authoritative gate runs in
// parallel on /chat/clarify.

export interface Turn {
  role: "user" | "assistant";
  text: string;
}

export function userTurns(turns: Turn[]): number {
  return turns.filter((t) => t.role === "user").length;
}

export function lastAssistantEndedInQ(turns: Turn[]): boolean {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.role === "assistant") {
      // Judge P1-1: match ASCII, fullwidth, Arabic, and trailing-punct forms.
      return /[?？؟][\s)\]\"'*]*$/.test(t.text.trimEnd());
    }
  }
  return false;
}

export function lastUserEndedInQ(turns: Turn[]): boolean {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!;
    if (t.role === "user") {
      const trimmed = t.text.trimEnd();
      if (/[?？؟][\s)\]\"'*]*$/.test(trimmed)) return true;
      if (/^(what|why|how|huh|eh|which|can you|could you|would you)\b/i.test(t.text.trim())) {
        return true;
      }
      return false;
    }
  }
  return false;
}

export function shouldTriggerAudit(turns: Turn[]): boolean {
  // Calibration fix: if the user's last turn is a question, keep clarifying.
  if (lastUserEndedInQ(turns)) return false;
  const u = userTurns(turns);
  if (u >= 4) return true;
  if (u >= 3 && !lastAssistantEndedInQ(turns)) return true;
  return false;
}

// improve-01 Job 2 detection (front-end mirror of stops.ts). Same shape,
// same thresholds — both sides need to agree that "paste of AI recommendation"
// is what just happened, so the front-end can skip the Stage-1 round-trip
// and the server can return `audit-now` to direct API callers. If these two
// drift, chat will call /chat/clarify and then fall through anyway, so the
// worst case is one extra RTT — but keep them in sync to save that RTT.
const RECO_OPENER = /\bi\s+(?:recommend|suggest)\b|\bi['\u2019]d?\s+(?:recommend|suggest|go\s+with|pick|choose)\b|\bmy\s+(?:pick|top\s+pick|top\s+choice|recommendation|suggestion)\b|\bbased\s+on\s+your\b|\bfor\s+your\s+(?:use\s+case|criteria|needs|budget)\b|\b(?:check\s+out|consider)\s+the\b|\b(?:popular|top|best|strong)\s+(?:pick|choice|option)\b/i;
const CITED_REASONS =
  /\b(?:three|3|four|4|five|5)\s+reasons\b|\breasons?\s+(?:to\s+(?:pick|consider|choose)|why)\b|\(\s*1\s*\)[\s\S]{2,200}\(\s*2\s*\)|\b1\.\s[\s\S]{2,200}\b2\.\s|\bfirst\b[\s\S]{2,200}\bsecond\b|\bit\s+(?:gives|offers|has|features|comes\s+with|delivers)\b/i;
const MODEL_CODE = /\b[A-Z][a-zA-Z'\u2019]+(?:[\s-][A-Z][a-zA-Z'\u2019]*){0,3}\s+[A-Z0-9][A-Z0-9-]{1,}\b/;
const PRICE_SENTINEL =
  /\$\s?\d{2,}(?:[,.\d]+)?|\bpriced?\s+(?:at|around|under|near|from)\s+\$?\d{2,}|\bMSRP\b|\blist\s+price\b|\bstarting\s+at\s+\$/i;

export function looksLikeAIRecommendation(text: string): boolean {
  const t = text.trim();
  if (t.length < 100) return false;
  let score = 0;
  if (RECO_OPENER.test(t)) score += 1;
  if (CITED_REASONS.test(t)) score += 1;
  if (MODEL_CODE.test(t)) score += 1;
  if (PRICE_SENTINEL.test(t)) score += 1;
  return score >= 2;
}

export function inferHostAI(text: string): "chatgpt" | "claude" | "gemini" | "rufus" | "unknown" {
  const t = text.toLowerCase();
  if (/\bon\s+amazon\b|\bavailable\s+on\s+amazon\b|\bsold\s+by\s+amazon\b|rufus/i.test(t)) return "rufus";
  if (/i['\u2019]ll\s+clarify|let\s+me\s+(?:be\s+)?clarify|gemini/i.test(t)) return "gemini";
  if (/as\s+(?:claude|an\s+ai)|anthropic/i.test(t)) return "claude";
  if (/chatgpt|openai|as\s+of\s+my\s+last\s+update/i.test(t)) return "chatgpt";
  return "unknown";
}

// Rotating-status phrases shown during the Stage-2 audit wall.
// Judge P3-1: softer phrasing ("checking the claims the AIs made" vs
// "catching any confabulated claims") so Sarah-in-VISION §3 parses it.
export const ROTATING_STATUS_PHRASES: readonly string[] = [
  "Looking at real products on retailer sites…",
  "Checking spec sheets against your criteria…",
  "Checking the claims the AIs made…",
  "Comparing against other frontier models…",
  "Ranking with transparent utility math…",
] as const;
