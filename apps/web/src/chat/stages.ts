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
