// F6 — host adapter common types + utilities.

export type HostId = "chatgpt" | "claude" | "gemini" | "rufus" | "perplexity" | "unknown";

export interface HostAdapter {
  id: HostId;
  match(url: URL): boolean;
  detectResponses(root: Document | Element): HTMLElement[];
  extractText(el: HTMLElement): string;
  responseAnchor(el: HTMLElement): HTMLElement;
  extractUserPrompt?(el: HTMLElement): string | null;
}

export function txt(el: HTMLElement | null): string {
  return el?.innerText?.trim() ?? "";
}

// Judge P1-5: consolidated namespace for stale-selector telemetry. Returns
// true the first time a host's stale flag flips, false thereafter.
export function markStale(host: HostId): boolean {
  const g = globalThis as { __lens?: { stale?: Record<string, boolean> } };
  g.__lens = g.__lens ?? {};
  g.__lens.stale = g.__lens.stale ?? {};
  if (g.__lens.stale[host]) return false;
  g.__lens.stale[host] = true;
  return true;
}
