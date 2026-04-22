// S4-W24 — host-shipping-policy lookup.
// Returns an estimated shipping cost + source tag for the total-cost response.

export interface ShippingResolve {
  amount: number;
  reasoning: string;
  source: "host-policy" | "estimated";
}

export function resolveShipping(host: string, sticker: number): ShippingResolve {
  const h = host.toLowerCase();
  if (/(^|\.)amazon\./.test(h)) {
    return {
      amount: 0,
      reasoning: "Amazon Prime assumed; non-Prime buyers may incur $3.99-$6.99 shipping.",
      source: "host-policy",
    };
  }
  if (/(^|\.)bestbuy\./.test(h)) {
    return sticker >= 35
      ? { amount: 0, reasoning: "Best Buy free shipping on orders over $35.", source: "host-policy" }
      : { amount: 5.99, reasoning: "Best Buy flat $5.99 under $35.", source: "host-policy" };
  }
  if (/(^|\.)walmart\./.test(h)) {
    return sticker >= 35
      ? { amount: 0, reasoning: "Walmart free shipping on orders over $35.", source: "host-policy" }
      : { amount: 6.99, reasoning: "Walmart flat $6.99 under $35.", source: "host-policy" };
  }
  if (/(^|\.)target\./.test(h)) {
    return sticker >= 35
      ? { amount: 0, reasoning: "Target free shipping on orders over $35.", source: "host-policy" }
      : { amount: 5.99, reasoning: "Target flat $5.99 under $35.", source: "host-policy" };
  }
  if (/(^|\.)homedepot\./.test(h)) {
    return sticker >= 45
      ? { amount: 0, reasoning: "Home Depot free shipping on orders over $45.", source: "host-policy" }
      : { amount: 7.99, reasoning: "Home Depot flat $7.99 under $45.", source: "host-policy" };
  }
  if (/(^|\.)costco\./.test(h)) {
    return {
      amount: 0,
      reasoning: "Costco free shipping on most items.",
      source: "host-policy",
    };
  }
  // Unknown or Shopify-generic: conservative estimate of 5% capped at $25.
  const estimated = Math.min(25, Math.max(3.99, Math.round(sticker * 0.05 * 100) / 100));
  return {
    amount: estimated,
    reasoning: `Host policy unknown; estimated at 5% of sticker (capped at $25).`,
    source: "estimated",
  };
}
