// V-EXT-INLINE-h — Amazon review-authenticity inline banner.
// Scrapes visible reviews on Amazon product + dedicated review pages, POSTs
// /review-scan, renders a single shadow-DOM banner at the top of the reviews
// block. Silent-unless-signal (Apple-bar §6): green ≥0.7 is compact; amber
// 0.4-0.7 and red <0.4 are prominent.

import { canStage2, getConsent } from "../consent.js";

const API_BASE = "https://lens-api.webmarinelli.workers.dev";
const BADGE_ATTR = "data-lens-review-scan";
const BADGED_ANCHORS = new WeakSet<HTMLElement>();
// Judge P0-3: cache per-ASIN so filter/sort pushState doesn't burn rate-limit.
interface CachedScan {
  result: ReviewScanResponse;
  reviewCount: number;
  at: number;
}
const SCAN_CACHE = new Map<string, CachedScan>();
const SCAN_TTL_MS = 10 * 60 * 1000; // 10 min
// Judge P0-2: single-flight guard so setTimeout + retailReboot don't both hit
// the wire during a pushState race inside the 1.5s boot delay.
let inFlight = false;

export interface ScrapedReview {
  text: string;
  rating?: number;
  date?: string;
  reviewer?: string;
}

export interface ReviewScanResponse {
  authenticityScore: number;
  signalsFound: string[];
  flaggedReviewIndices: number[];
  summary: string;
  packSlug: string;
  heuristics: {
    temporalClusteringPct: number;
    languageHomogeneityScore: number;
    fiveStarSharePct: number;
    templatePhrasingHitPct: number;
    lengthHomogeneityScore: number;
  };
}

type Band = "clean" | "mixed" | "suspect";

interface BandUI {
  color: string;
  bg: string;
  border: string;
  icon: string;
  label: string;
}

const BAND_UI: Record<Band, BandUI> = {
  clean: { color: "#247a50", bg: "#ecfaf2", border: "#3fb27f", icon: "✓", label: "Reviews look authentic" },
  mixed: { color: "#9c6b14", bg: "#fdf5e6", border: "#c78a1f", icon: "⚠", label: "Mixed review signals" },
  suspect: { color: "#8a2f2f", bg: "#fdecec", border: "#d85a5a", icon: "✗", label: "Reviews look suspect" },
};

export function isAmazonReviewContext(url: URL = new URL(window.location.href)): boolean {
  const host = url.hostname.toLowerCase();
  if (!host.includes("amazon.")) return false;
  const p = url.pathname.toLowerCase();
  // Product pages carry reviews below the fold at #customerReviews; the
  // dedicated review list lives at /product-reviews/ASIN/.
  return (
    /\/dp\/[a-z0-9]{8,12}/i.test(p) ||
    /\/gp\/product\/[a-z0-9]{8,12}/i.test(p) ||
    p.includes("/product-reviews/")
  );
}

function parseRating(text: string | undefined | null): number | undefined {
  if (!text) return undefined;
  // "5.0 out of 5 stars" → 5
  const m = text.match(/([0-5](?:\.\d)?)\s*out of\s*5/i);
  if (m) return Number(m[1]);
  const n = text.match(/^\s*([0-5](?:\.\d)?)\s*$/);
  if (n) return Number(n[1]);
  return undefined;
}

function parseReviewDate(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  // US: "Reviewed in the United States on March 3, 2025"
  const us = text.match(/on\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/);
  if (us) {
    const d = new Date(us[1]!);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // Judge P1-4: UK/day-first: "Reviewed in the United Kingdom on 3 March 2025"
  const uk = text.match(/on\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (uk) {
    const d = new Date(`${uk[2]} ${uk[1]}, ${uk[3]}`);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return undefined;
}

function extractAsin(url: string = location.href): string | null {
  const m = url.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{8,12})/i);
  return m ? m[1]!.toUpperCase() : null;
}

export function scrapeVisibleReviews(doc: Document = document): ScrapedReview[] {
  const wrappers = doc.querySelectorAll<HTMLElement>('[data-hook="review"]');
  const out: ScrapedReview[] = [];
  for (const el of Array.from(wrappers)) {
    const bodyEl =
      el.querySelector<HTMLElement>('[data-hook="review-body"] span:not(.a-color-base)') ??
      el.querySelector<HTMLElement>('[data-hook="review-body"]');
    const text = (bodyEl?.innerText ?? bodyEl?.textContent ?? "").trim();
    if (!text || text.length < 8) continue;
    const ratingEl =
      el.querySelector<HTMLElement>('[data-hook="review-star-rating"]') ??
      el.querySelector<HTMLElement>('[data-hook="cmps-review-star-rating"]');
    const dateEl = el.querySelector<HTMLElement>('[data-hook="review-date"]');
    const reviewerEl =
      el.querySelector<HTMLElement>('[data-hook="genome-widget"] .a-profile-name') ??
      el.querySelector<HTMLElement>('.a-profile-name');
    const entry: ScrapedReview = { text };
    const rating = parseRating(ratingEl?.innerText ?? ratingEl?.textContent);
    if (rating !== undefined) entry.rating = rating;
    const date = parseReviewDate(dateEl?.innerText ?? dateEl?.textContent);
    if (date !== undefined) entry.date = date;
    const reviewer = (reviewerEl?.innerText ?? reviewerEl?.textContent ?? "").trim();
    if (reviewer) entry.reviewer = reviewer;
    out.push(entry);
  }
  return out;
}

export function reviewAnchor(doc: Document = document): HTMLElement | null {
  return (
    doc.querySelector<HTMLElement>("#cm-cr-dp-review-list") ??
    doc.querySelector<HTMLElement>("#cm_cr-review_list") ??
    doc.querySelector<HTMLElement>("#reviews-medley-footer") ??
    doc.querySelector<HTMLElement>("#customerReviews") ??
    null
  );
}

function extractProductName(doc: Document = document): string | undefined {
  const el = doc.querySelector<HTMLElement>("#productTitle");
  const t = (el?.innerText ?? el?.textContent ?? "").trim();
  return t || undefined;
}

export async function postReviewScan(
  reviews: ScrapedReview[],
  productName?: string,
): Promise<ReviewScanResponse | null> {
  if (reviews.length < 2) return null;
  // Judge P0-1: drop reviewer name — AMBIENT_MODEL §2 Stage-2 contract =
  // "short excerpt," not PII. Backend accepts but never uses reviewer, so
  // stripping client-side keeps PII off the wire entirely.
  const sanitized = reviews.map((r) => {
    const out: ScrapedReview = { text: r.text };
    if (r.rating !== undefined) out.rating = r.rating;
    if (r.date !== undefined) out.date = r.date;
    return out;
  });
  try {
    const res = await fetch(`${API_BASE}/review-scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reviews: sanitized, ...(productName ? { productName } : {}) }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ReviewScanResponse;
  } catch (err) {
    console.warn("[Lens] review-scan fetch failed:", (err as Error).message);
    return null;
  }
}

function bandFor(score: number): Band {
  if (score >= 0.7) return "clean";
  if (score >= 0.4) return "mixed";
  return "suspect";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function renderBanner(
  result: ReviewScanResponse,
  anchor: HTMLElement,
  reviewCount: number,
): HTMLElement | null {
  if (anchor.hasAttribute(BADGE_ATTR)) return null;
  if (BADGED_ANCHORS.has(anchor)) return null;
  if (document.querySelector('[data-lens="review-scan-host"]')) return null;

  const band = bandFor(result.authenticityScore);
  const ui = BAND_UI[band];
  // Silent-unless-signal — clean + zero signals = no banner at all.
  if (band === "clean" && result.signalsFound.length === 0) {
    anchor.setAttribute(BADGE_ATTR, "1");
    BADGED_ANCHORS.add(anchor);
    return null;
  }

  const flaggedCount = result.flaggedReviewIndices.length;
  const top2 = result.signalsFound.slice(0, 2);
  const pct = Math.round(result.authenticityScore * 100);
  const headline =
    band === "suspect"
      ? `Likely incentivized — ${flaggedCount} of ${reviewCount} reviews suspect`
      : band === "mixed"
        ? flaggedCount > 0
          ? `${flaggedCount} of ${reviewCount} reviews flagged`
          : `Mixed review signals (${pct}% authentic)`
        : `Reviews look authentic (${pct}%)`;

  const host = document.createElement("div");
  host.setAttribute("data-lens", "review-scan-host");
  host.style.cssText = "margin:12px 0;line-height:0;";
  const shadow = host.attachShadow({ mode: "closed" });
  const signalsHtml = top2
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");

  // Judge P1-6: don't nest interactive button inside role="status" live
  // region — screen-readers double-announce and skip aria-expanded changes.
  // The bare span with role=status carries only the headline; the button sits
  // beside it as an independent control.
  // Judge P3-10: hide /100 score on suspect band — redundant with the headline.
  const showScore = band !== "suspect";
  shadow.innerHTML = `
    <style>
      :host, button, section, ul, li, div, span { all: initial; }
      * { box-sizing: border-box; }
      .wrap {
        display: block;
        background: ${ui.bg}; color: ${ui.color};
        border: 1px solid ${ui.border}; border-radius: 8px;
        padding: ${band === "clean" ? "8px 12px" : "12px 14px"};
        font: 500 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .head { display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 700; width: 100%; text-align: left; }
      .head:focus-visible { outline: 2px solid #DA7756; outline-offset: 2px; border-radius: 4px; }
      .icon { font-size: 15px; line-height: 1; }
      .label { font-weight: 700; letter-spacing: 0.01em; }
      .score { margin-left: auto; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 12px; font-weight: 500; opacity: 0.82; }
      .status-sr { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
      .details { margin-top: 10px; padding-top: 10px; border-top: 1px solid ${ui.border}40; display: none; }
      .details.open { display: block; }
      .details ul { margin: 0; padding: 0 0 0 18px; font-size: 12px; font-weight: 500; }
      .details li { margin: 3px 0; color: ${ui.color}; list-style: disc; }
      .caveat { margin-top: 8px; font-size: 11px; font-weight: 500; color: ${ui.color}; opacity: 0.85; }
    </style>
    <section class="wrap">
      <span class="status-sr" role="status" aria-live="polite">Lens review authenticity: ${escapeHtml(ui.label)}. ${escapeHtml(headline)}</span>
      <button type="button" class="head" aria-expanded="false" aria-label="${escapeHtml(headline)}. Expand for details.">
        <span class="icon" aria-hidden="true">${ui.icon}</span>
        <span class="label">Lens: ${escapeHtml(headline)}</span>
        ${showScore ? `<span class="score" aria-hidden="true">${pct}/100</span>` : ""}
      </button>
      ${top2.length > 0
        ? `<div class="details">
             <ul>${signalsHtml}</ul>
             <div class="caveat">Scanned ${reviewCount} visible review${reviewCount === 1 ? "" : "s"}. Heuristic — seek independent reviews before purchase.</div>
           </div>`
        : ""}
    </section>
  `;
  const head = shadow.querySelector<HTMLButtonElement>(".head")!;
  const details = shadow.querySelector<HTMLDivElement>(".details");
  head.addEventListener("click", () => {
    if (!details) return;
    const open = details.classList.toggle("open");
    head.setAttribute("aria-expanded", open ? "true" : "false");
  });
  anchor.insertAdjacentElement("beforebegin", host);
  anchor.setAttribute(BADGE_ATTR, "1");
  BADGED_ANCHORS.add(anchor);
  return host;
}

export async function bootReviewScan(): Promise<void> {
  if (!isAmazonReviewContext()) return;
  // Judge P0-2: single-flight — if a prior invocation is still in-flight,
  // skip. SPA pushState + setTimeout boot can race otherwise.
  if (inFlight) return;
  const hostName = location.host;
  // Consent gate — review text IS Stage-2 excerpt traffic per AMBIENT_MODEL §2.
  if (getConsent(hostName) === "never") return;
  if (!canStage2(hostName)) return;
  const anchor = reviewAnchor();
  if (!anchor) {
    console.log("[Lens] review-scan: no review anchor on", hostName);
    return;
  }
  // Judge P0-3: ASIN cache — Amazon fires pushState on every sort/filter
  // inside /product-reviews/; without a cache each one burns rate-limit.
  const asin = extractAsin();
  if (asin) {
    const cached = SCAN_CACHE.get(asin);
    if (cached && Date.now() - cached.at < SCAN_TTL_MS) {
      renderBanner(cached.result, anchor, cached.reviewCount);
      return;
    }
  }
  const reviews = scrapeVisibleReviews();
  if (reviews.length < 2) {
    console.log("[Lens] review-scan: fewer than 2 reviews visible");
    return;
  }
  const productName = extractProductName();
  inFlight = true;
  try {
    const result = await postReviewScan(reviews, productName);
    if (!result) return;
    if (asin) SCAN_CACHE.set(asin, { result, reviewCount: reviews.length, at: Date.now() });
    renderBanner(result, anchor, reviews.length);
  } finally {
    inFlight = false;
  }
}
