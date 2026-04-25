import { describe, expect, it } from "vitest";
import type { CustomerJourneyMap } from "@lens/shared";
import { renderCustomerJourneyMap } from "./customer-journey-map.js";

const MAP: CustomerJourneyMap = {
  version: "customer-journey-map-v1",
  generatedAt: "2026-04-25T00:00:00.000Z",
  readiness: { live: 5, partial: 2, planned: 0, total: 7, score: 0.857 },
  guarantees: ["No affiliate links", "\"><script>alert(1)</script>"],
  privacyControls: ["Disable Gmail", "Disable Plaid-style financial signals"],
  stages: [
    {
      id: "product_page",
      label: "Product Page",
      status: "live",
      promise: "Audit retailer pages.",
      surfaces: ["URL mode", "extension"],
      endpoints: ["/resolve-url", "/counterfeit/check", "/price-history", "/visual-audit", "/sku/search", "/sku/:id"],
      workflows: ["W15"],
      dataSources: ["SKU spine"],
      implementedSignals: ["affiliate stripping"],
      edgeCasesCovered: ["Amazon URL with affiliate/ref tracking parameters", "blocked HTML"],
      failureRecovery: ["use visual audit when HTML fetch is blocked", "return candidates"],
      consentTier: "local_only",
      userControls: ["per-host extension consent"],
      nextHardening: [],
    },
  ],
};

describe("customer journey map UI", () => {
  it("renders readiness, endpoint chips, edge cases, and privacy controls", () => {
    const root = document.createElement("section");
    renderCustomerJourneyMap(MAP, root);

    expect(root.textContent).toContain("86% wired today");
    expect(root.textContent).toContain("Amazon URL with affiliate/ref tracking parameters");
    expect(root.textContent).toContain("/resolve-url");
    expect(root.textContent).toContain("Disable Plaid-style financial signals");
    expect(root.innerHTML).not.toContain("<script>");
  });

  it("does not over-render long endpoint lists", () => {
    const root = document.createElement("section");
    renderCustomerJourneyMap(MAP, root);

    expect(root.querySelectorAll(".journey-endpoints code")).toHaveLength(6);
    expect(root.textContent).toContain("+1 more");
  });
});
