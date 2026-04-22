// S4-W27 — Levenshtein edit distance.
// O(n*m) dynamic programming with a two-row rolling buffer. Case-insensitive.

export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  const n = s.length;
  const m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,          // deletion
        curr[j - 1] + 1,      // insertion
        prev[j - 1] + cost,   // substitution
      );
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[m];
}

export interface TyposquatMatch {
  brand: string;
  distance: number;
}

/**
 * Find the nearest brand to `input` (among the allowlist). Return null when
 * input is already an exact match (distance 0) — there's nothing to warn
 * about when the label IS the brand.
 */
export function findNearestBrand(input: string, brands: readonly string[]): TyposquatMatch | null {
  let best: TyposquatMatch | null = null;
  const lower = input.toLowerCase();
  for (const brand of brands) {
    const d = levenshtein(lower, brand);
    if (d === 0) return null; // exact match means this IS the brand, not a squat
    if (!best || d < best.distance) best = { brand, distance: d };
  }
  return best;
}
