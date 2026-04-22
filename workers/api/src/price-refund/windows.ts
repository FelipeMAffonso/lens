// S6-W34 — retailer price-match window table.
// Static data; expandable via PR. Each entry carries provenance notes in code
// comments so changes are auditable.

import type { RetailerWindow } from "./types.js";

const WINDOWS: Record<string, RetailerWindow> = {
  // Best Buy: 15-day price match. Source: bestbuy.com/site/help-topics/price-match-guarantee
  bestbuy: {
    retailer: "Best Buy",
    days: 15,
    active: true,
    note: "Standard. Elite / Elite+ members get extended windows.",
    portalUrl: "https://www.bestbuy.com/site/customer-service/price-match-guarantee/pcmcat297300050000.c",
  },

  // Target: 14-day price match (standard). RedCard holders can sometimes extend.
  // Source: target.com/help/article/price-match-guarantee
  target: {
    retailer: "Target",
    days: 14,
    active: true,
    note: "14-day standard window; excludes Target Plus marketplace sellers.",
    portalUrl: "https://help.target.com/help/subcategoryarticle?childcat=Price+Match+Guarantee",
  },

  // Walmart: 7-day for Walmart.com items. Marketplace third-party excluded.
  // Source: walmart.com/help/article/walmart-com-price-match-policy
  walmart: {
    retailer: "Walmart",
    days: 7,
    active: true,
    note: "Walmart.com-only (no marketplace sellers). Walmart discontinued in-store price-matching for competitors in 2019.",
    portalUrl: "https://www.walmart.com/help/article/walmart-com-price-match-policy/e91a8e51ceac4b8aabaae7bb9e70dd61",
  },

  // Home Depot: 30 days, both pre- and post-purchase. Called "Low Price Guarantee".
  // Source: homedepot.com/c/Low_Price_Guarantee
  homedepot: {
    retailer: "Home Depot",
    days: 30,
    active: true,
    note: "Low Price Guarantee — includes installation services when identical SKU.",
    portalUrl: "https://www.homedepot.com/c/Low_Price_Guarantee",
  },

  // Lowe's: 30 days for most items. Source: lowes.com/l/help/price-match-guarantee
  lowes: {
    retailer: "Lowe's",
    days: 30,
    active: true,
    note: "Standard Price Promise for identical, in-stock items.",
    portalUrl: "https://www.lowes.com/l/help/price-match-guarantee.html",
  },

  // Costco: 30-day low-price guarantee on most items (excludes limited-time promotional).
  // Source: costco.com/help-center (Low Price Guarantee)
  costco: {
    retailer: "Costco",
    days: 30,
    active: true,
    note: "30-day low-price guarantee; excludes Costco Travel and limited-time promotions.",
  },

  // Amazon: NO active price-matching as of 2018-05-04. Source: multiple 2018 press.
  // Flag it so the detector explicitly explains the "no-claim" verdict.
  amazon: {
    retailer: "Amazon",
    days: 0,
    active: false,
    note: "Amazon discontinued price matching in 2018. Only exception: pre-order price guarantee (physical/digital media).",
  },

  // Apple: 14-day price-match window for items purchased directly from apple.com / Apple Store.
  apple: {
    retailer: "Apple",
    days: 14,
    active: true,
    note: "Apple Price Protection — 14 days from receipt, Apple-owned sales only.",
  },
};

/** Canonicalize a retailer name to the windows-map key. */
export function normalizeRetailer(retailer: string | null | undefined): string | null {
  if (!retailer) return null;
  const r = retailer.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!r) return null;
  // Direct match
  if (WINDOWS[r]) return r;
  // Substring fallback for things like "bestbuy.com", "Home Depot", etc.
  for (const key of Object.keys(WINDOWS)) {
    if (r.includes(key)) return key;
  }
  return null;
}

export function windowFor(retailer: string | null | undefined): RetailerWindow | null {
  const key = normalizeRetailer(retailer);
  if (!key) return null;
  return WINDOWS[key] ?? null;
}

export function listWindows(): RetailerWindow[] {
  return Object.values(WINDOWS);
}

export const ALL_WINDOW_KEYS = Object.keys(WINDOWS);
