// S4-W27 — pure scorer. Composes per-signal results into overall verdict.

import { MAJOR_BRANDS, VERIFIED_RETAILERS, apexLabel, canonicalHost } from "./brands.js";
import { lookupDomainAge } from "./domain-age.js";
import { findNearestBrand } from "./levenshtein.js";
import type {
  OverallVerdict,
  ScamAssessRequest,
  ScamAssessResponse,
  SignalResult,
  Typosquat,
} from "./types.js";

const SIGNAL_WEIGHT: Record<SignalResult["verdict"], number> = {
  fail: 40,
  warn: 15,
  ok: 0,
};

const TRUST_BONUS = 15;

export function assessScam(req: ScamAssessRequest, now: Date = new Date()): ScamAssessResponse {
  const host = canonicalHost(req.host);
  const label = apexLabel(host);
  const signals: SignalResult[] = [];
  let risk = 0;
  let typosquat: Typosquat | undefined;

  // 1. Domain age (fixture)
  const age = lookupDomainAge(host, now);
  if (age.status === "known-very-recent") {
    signals.push({
      id: "domain-age",
      verdict: "fail",
      detail: `Domain registered ${age.daysSinceRegistered ?? "?"} days ago — too new to be a mature retailer.`,
    });
    risk += SIGNAL_WEIGHT.fail;
  } else if (age.status === "known-recent") {
    signals.push({
      id: "domain-age",
      verdict: "warn",
      detail: `Domain registered ${age.daysSinceRegistered} days ago — relatively new.`,
    });
    risk += SIGNAL_WEIGHT.warn;
  } else if (age.status === "known-old") {
    signals.push({
      id: "domain-age",
      verdict: "ok",
      detail: `Domain established ${Math.floor((age.daysSinceRegistered ?? 0) / 365)} years ago.`,
    });
  } else {
    signals.push({
      id: "domain-age",
      verdict: "warn",
      detail: "Domain registration date unknown to Lens — exercise additional caution.",
    });
    risk += SIGNAL_WEIGHT.warn;
  }

  // 2. Typosquat. We scan (a) the full apex label and (b) each hyphen-split
  // token of the label, so "amaz0n-deals" catches the "amaz0n" token as a
  // typosquat of "amazon" even though the full label is far from any brand.
  const candidates = [label, ...label.split(/[-_]/).filter((s) => s.length >= 4)];
  let bestNear: ReturnType<typeof findNearestBrand> = null;
  for (const cand of candidates) {
    const match = findNearestBrand(cand, MAJOR_BRANDS);
    if (match && (!bestNear || match.distance < bestNear.distance)) {
      bestNear = match;
    }
  }
  if (bestNear) {
    if (bestNear.distance === 1) {
      signals.push({
        id: "typosquat",
        verdict: "fail",
        detail: `Host "${label}" contains a label 1 edit away from brand "${bestNear.brand}" — likely typosquat.`,
      });
      risk += SIGNAL_WEIGHT.fail;
      typosquat = { nearestBrand: bestNear.brand, editDistance: 1 };
    } else if (bestNear.distance === 2) {
      signals.push({
        id: "typosquat",
        verdict: "warn",
        detail: `Host "${label}" contains a label 2 edits from "${bestNear.brand}" — possible typosquat.`,
      });
      risk += SIGNAL_WEIGHT.warn;
      typosquat = { nearestBrand: bestNear.brand, editDistance: 2 };
    } else {
      signals.push({
        id: "typosquat",
        verdict: "ok",
        detail: `No close typosquat match (nearest: "${bestNear.brand}" at ${bestNear.distance} edits).`,
      });
    }
  }

  // 3. HTTPS
  if (req.receivedViaHttps === false) {
    signals.push({
      id: "https",
      verdict: "warn",
      detail: "Page was served over HTTP (not HTTPS) — no confidentiality / integrity on the wire.",
    });
    risk += SIGNAL_WEIGHT.warn;
  } else {
    signals.push({
      id: "https",
      verdict: "ok",
      detail: "HTTPS in use (or status not supplied).",
    });
  }

  // 4. Trust-signal bonus
  if (VERIFIED_RETAILERS.has(host)) {
    signals.push({
      id: "trust-signals",
      verdict: "ok",
      detail: `${host} is on Lens's verified-retailer allowlist.`,
    });
    risk -= TRUST_BONUS;
  }

  // 5. Price-too-low
  if (req.category && req.price !== undefined) {
    const floor = CATEGORY_PRICE_FLOOR[req.category.toLowerCase()];
    if (floor !== undefined && req.price < floor / 3) {
      signals.push({
        id: "price-too-low",
        verdict: "fail",
        detail: `Price $${req.price.toFixed(2)} is less than one-third the typical floor ($${floor.toFixed(2)}) for "${req.category}".`,
      });
      risk += SIGNAL_WEIGHT.fail;
    } else if (floor !== undefined) {
      signals.push({
        id: "price-too-low",
        verdict: "ok",
        detail: `Price $${req.price.toFixed(2)} is plausible for the ${req.category} category.`,
      });
    }
  }

  if (risk < 0) risk = 0;
  if (risk > 100) risk = 100;
  const verdict: OverallVerdict = risk < 20 ? "safe" : risk < 55 ? "caution" : "scam";

  return {
    host,
    verdict,
    riskScore: risk,
    signals,
    ...(typosquat ? { typosquat } : {}),
    source: "fixture",
    generatedAt: new Date().toISOString(),
  };
}

/** Price floors (USD) for the price-too-low signal. Minimum plausible price
 *  for a LEGITIMATE product in the category. Dividing by 3 gives the
 *  impossibly-low scam threshold. */
const CATEGORY_PRICE_FLOOR: Record<string, number> = {
  laptops: 400,
  laptop: 400,
  "espresso machines": 100,
  "espresso machine": 100,
  headphones: 40,
  televisions: 200,
  tv: 200,
  smartphones: 300,
  smartphone: 300,
  cameras: 300,
  camera: 300,
  watches: 80,
};
