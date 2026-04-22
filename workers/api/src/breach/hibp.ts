// S4-W26 — HIBP API scaffold. Fail-closed when no key. Unit-testable shape.

import type { BreachRecord } from "./types.js";

export interface HibpOptions {
  apiKey: string;
  fetch?: typeof fetch;
}

/**
 * HIBP's domain search requires a paid subscription. When credentials are
 * missing we return null (caller falls back to fixtures). When credentials
 * are present we call the /breacheddomain/{host} endpoint and normalize.
 */
export async function fetchHibpBreachesForHost(
  host: string,
  opts: HibpOptions,
): Promise<BreachRecord[] | null> {
  if (!opts.apiKey) return null;
  const f = opts.fetch ?? fetch;
  const url = `https://haveibeenpwned.com/api/v3/breacheddomain/${encodeURIComponent(host)}`;
  try {
    const res = await f(url, {
      headers: {
        "hibp-api-key": opts.apiKey,
        "user-agent": "Lens/1.0",
      },
    });
    if (res.status === 404) return []; // domain unknown to HIBP — empty result
    if (!res.ok) return null;
    const body = await res.json();
    return normalizeHibp(body, host);
  } catch (err) {
    console.error("[breach:hibp]", (err as Error).message);
    return null;
  }
}

export function normalizeHibp(body: unknown, host: string): BreachRecord[] {
  if (!body || typeof body !== "object") return [];
  // HIBP's domain-breach endpoint returns a map of breachNames → email-count
  // entries. For Lens purposes, we surface a single aggregated record per
  // named breach.
  const map = body as Record<string, unknown>;
  const out: BreachRecord[] = [];
  for (const [name, value] of Object.entries(map)) {
    const count = typeof value === "number" ? value : 0;
    out.push({
      id: `hibp-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      host,
      date: new Date().toISOString().slice(0, 10), // HIBP domain endpoint doesn't expose date; placeholder until we fan-out to /breach/{name}
      recordsExposed: count,
      dataTypes: ["email"],
      severity: count > 10_000_000 ? "critical" : count > 1_000_000 ? "high" : "moderate",
      source: "HIBP",
      summary: `HIBP reports ${count.toLocaleString()} affected accounts on ${host} in breach "${name}".`,
    });
  }
  return out;
}
