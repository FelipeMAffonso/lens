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

// D2 / workflow coverage — detect ANY http(s) URL in chat.
// Short-circuits to /audit with kind="url". The backend /audit url path runs
// S3-W15 per-host parsers first (amazon/bestbuy/walmart/target/homedepot/
// shopify/universal JSON-LD/OpenGraph/microdata) and falls through to the
// Jina-markdown + Opus structured-extraction pipeline for any site. So the
// client only needs to recognize "this is a URL" — the server figures out
// the rest and will degrade gracefully (insufficient-data stub) if a page
// blocks bots and lacks any structured hints.
const KNOWN_RETAILER_RE = /^https?:\/\/(?:www\.)?(amazon|bestbuy|walmart|target|homedepot|costco|ebay|etsy|sams|newegg|bhphotovideo|adorama|rei|dickssportinggoods|academy|zappos|zappo|wayfair|potterybarn|ikea|apple|microsoft|sony|samsung|lg|lenovo|dell|hp|breville|dyson|delonghi|bose|sennheiser|logitech|anker|nike|adidas|patagonia|northface|columbia|llbean|tesla|peloton|temu|aliexpress|shein|wish|rakuten|jd|tmall|mercadolibre|argos|currys|johnlewis|mediamarkt|otto|zalando)\./i;

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function looksLikeAnyProductUrl(text: string): { ok: true; url: string; knownRetailer: boolean } | { ok: false } {
  const t = text.trim();
  // Accept a line that's just a URL, or a URL with minimal prefix text.
  const match = t.match(/https?:\/\/\S+/);
  if (!match) return { ok: false };
  const url = match[0].replace(/[.,;:!)\]}"'>]+$/, "");
  const host = hostFromUrl(url);
  if (!host) return { ok: false };
  // Reject obvious non-product hosts (search engines, social, doc tools,
  // AI chat hosts). Anything else is fair game for the resolver pipeline.
  const NON_PRODUCT_HOSTS = new Set([
    "google.com", "bing.com", "duckduckgo.com",
    "twitter.com", "x.com", "facebook.com", "instagram.com", "tiktok.com", "linkedin.com",
    "chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com", "perplexity.ai",
    "docs.google.com", "notion.so", "figma.com",
    "github.com", "stackoverflow.com", "reddit.com",
    "wikipedia.org", "wikidata.org",
    "youtube.com", "vimeo.com",
    "mail.google.com", "outlook.live.com",
  ]);
  const bareHost = host.replace(/:\d+$/, "");
  if (NON_PRODUCT_HOSTS.has(bareHost)) return { ok: false };
  // Reject if the message has multiple sentences — that's a reco-paste that
  // happens to contain a URL, not a URL paste.
  if (t.split(/[.!?]\s/).length > 2) return { ok: false };
  return { ok: true, url, knownRetailer: KNOWN_RETAILER_RE.test(url) };
}

/** @deprecated Use looksLikeAnyProductUrl. Kept for compatibility with existing tests. */
export function looksLikeRetailerUrl(text: string): { ok: true; url: string } | { ok: false } {
  const r = looksLikeAnyProductUrl(text);
  if (!r.ok) return { ok: false };
  if (!r.knownRetailer) return { ok: false };
  return { ok: true, url: r.url };
}

export function inferHostAI(text: string): "chatgpt" | "claude" | "gemini" | "rufus" | "perplexity" | "unknown" {
  const t = text.toLowerCase();
  if (/perplexity|pplx|sources?:/i.test(t)) return "perplexity";
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
