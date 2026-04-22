// F7 — per-host learned suppression. After N dismissals of the same pattern on
// the same host, auto-suppress for a rolling window.
//
// Storage: `chrome.storage.local` preferred; falls back to localStorage for
// unit tests or non-extension contexts.

const KEY_PREFIX = "lens.suppress.v1";
const DISMISS_THRESHOLD = 3;
const SUPPRESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface Record {
  count: number;
  firstAt: number;
  lastAt: number;
  suppressedUntil?: number;
}

function keyOf(host: string, patternId: string): string {
  return `${KEY_PREFIX}.${host}.${patternId}`;
}

function readSync(key: string): Record | null {
  try {
    const s = (typeof localStorage !== "undefined" && localStorage.getItem(key)) || null;
    return s ? (JSON.parse(s) as Record) : null;
  } catch {
    return null;
  }
}
function writeSync(key: string, rec: Record): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(rec));
  } catch {
    // silent
  }
}

export function shouldSuppress(host: string, patternId: string): boolean {
  const rec = readSync(keyOf(host, patternId));
  if (!rec) return false;
  if (rec.suppressedUntil && rec.suppressedUntil > Date.now()) return true;
  return false;
}

export function recordDismissal(host: string, patternId: string): void {
  const k = keyOf(host, patternId);
  const now = Date.now();
  const cur = readSync(k) ?? { count: 0, firstAt: now, lastAt: now };
  cur.count += 1;
  cur.lastAt = now;
  if (cur.count >= DISMISS_THRESHOLD) {
    cur.suppressedUntil = now + SUPPRESS_WINDOW_MS;
  }
  writeSync(k, cur);
}

export function reset(host: string, patternId: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(keyOf(host, patternId));
  } catch {
    // silent
  }
}

export function getSuppressionState(host: string, patternId: string): Record | null {
  return readSync(keyOf(host, patternId));
}
