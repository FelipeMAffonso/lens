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
    if (t.role === "assistant") return t.text.trimEnd().endsWith("?");
  }
  return false;
}

export function shouldTriggerAudit(turns: Turn[]): boolean {
  const u = userTurns(turns);
  if (u >= 4) return true;
  if (u >= 3 && !lastAssistantEndedInQ(turns)) return true;
  return false;
}

// Rotating-status phrases shown during the Stage-2 audit wall.
export const ROTATING_STATUS_PHRASES: readonly string[] = [
  "Looking at real products on retailer sites…",
  "Checking spec sheets against your criteria…",
  "Catching any confabulated claims…",
  "Comparing against other frontier models…",
  "Ranking with transparent utility math…",
] as const;
