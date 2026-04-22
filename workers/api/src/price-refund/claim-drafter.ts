// S6-W34 — price-match claim letter + payload assembly.

import { windowFor } from "./windows.js";
import type { ClaimDraftPayload, ClaimDecision, PurchaseLike } from "./types.js";

export interface DraftInput {
  purchase: PurchaseLike;
  decision: Extract<ClaimDecision, { claim: true }>;
}

/**
 * Compose the intervention payload written to the F2 `interventions` row.
 * The `claimLetter` is a plain-text, retailer-formal draft ready to paste
 * into the retailer's customer-service portal.
 */
export function draftClaim(input: DraftInput): ClaimDraftPayload {
  const { purchase, decision } = input;
  const win = windowFor(purchase.retailer);
  const businessName = win?.retailer ?? purchase.retailer ?? "the retailer";

  const purchaseDate = purchase.purchasedAt.slice(0, 10);
  const letter = [
    `Subject: Price-match claim for order ${purchase.orderId ?? "(order ID)"} — ${purchase.productName}`,
    "",
    `Hello ${businessName} Customer Care,`,
    "",
    `I purchased ${purchase.productName} on ${purchaseDate}` +
      (purchase.orderId ? ` (order ${purchase.orderId})` : "") +
      ` for $${decision.originalPrice.toFixed(2)}.`,
    "",
    `The current price listed by ${businessName} is $${decision.currentPrice.toFixed(2)}, ` +
      `a drop of $${decision.delta.toFixed(2)} (${(decision.deltaPct * 100).toFixed(1)}%).`,
    "",
    `Per ${businessName}'s price-match guarantee (${win?.days ?? "?"}-day window; I am currently within it), ` +
      `I would like to request the difference of $${decision.delta.toFixed(2)} be refunded to my original payment method.`,
    "",
    `Thank you,`,
    `[your name]`,
  ].join("\n");

  const payload: ClaimDraftPayload = {
    businessName,
    originalPrice: decision.originalPrice,
    currentPrice: decision.currentPrice,
    priceDelta: decision.delta,
    purchaseDate,
    productName: purchase.productName,
    expiresAt: decision.expiresAt,
    claimLetter: letter,
    contactUrls: {},
  };
  if (purchase.orderId) payload.orderId = purchase.orderId;
  if (win?.portalUrl) payload.contactUrls.portal = win.portalUrl;
  if (win?.email) payload.contactUrls.email = win.email;
  return payload;
}
