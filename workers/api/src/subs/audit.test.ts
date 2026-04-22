import { describe, expect, it } from "vitest";
import { auditSubscriptions, monthlyEquivalent } from "./audit.js";
import type { SubscriptionRow } from "./types.js";

function row(over: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "s-1",
    user_id: "u1",
    service: "Netflix",
    amount: 15.49,
    currency: "USD",
    cadence: "monthly",
    next_renewal_at: "2026-05-01",
    source: "gmail",
    source_ref: "m-1",
    active: 1,
    detected_intent: "renewal",
    first_seen: "2026-01-01T00:00:00.000Z",
    last_seen: "2026-04-22T00:00:00.000Z",
    raw_payload_json: null,
    ...over,
  };
}

describe("monthlyEquivalent", () => {
  it("normalizes every cadence to a monthly figure", () => {
    expect(monthlyEquivalent(5, "weekly")).toBeCloseTo(21.73, 2);
    expect(monthlyEquivalent(10, "monthly")).toBe(10);
    expect(monthlyEquivalent(30, "quarterly")).toBe(10);
    expect(monthlyEquivalent(120, "yearly")).toBe(10);
  });

  it("assumes monthly when cadence is null", () => {
    expect(monthlyEquivalent(9.99, null)).toBe(9.99);
  });

  it("returns null for null amounts", () => {
    expect(monthlyEquivalent(null, "monthly")).toBeNull();
  });
});

describe("auditSubscriptions", () => {
  const NOW = "2026-04-22T12:00:00.000Z";

  it("returns all-good + empty-state one-liner when there are no subs", () => {
    const out = auditSubscriptions([], { now: NOW });
    expect(out.summary.totalActive).toBe(0);
    expect(out.summary.totalMonthlyCost).toBe(0);
    expect(out.findings).toEqual([]);
    expect(out.recommendation.band).toBe("all-good");
    expect(out.recommendation.oneLiner).toContain("No subscriptions on file");
  });

  it("sums active-monthly-cost across mixed cadences", () => {
    const rows = [
      row({ id: "a", service: "Netflix",  amount: 15.49, cadence: "monthly"   }),
      row({ id: "b", service: "Spotify",  amount: 10.99, cadence: "monthly"   }),
      row({ id: "c", service: "Prime",    amount: 139,   cadence: "yearly", next_renewal_at: "2027-01-01" }),
    ];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.summary.totalActive).toBe(3);
    expect(out.summary.totalMonthlyCost).toBeCloseTo(38.06, 2);
    expect(out.summary.totalAnnualCost).toBeCloseTo(456.72, 2);
  });

  it("excludes inactive rows from totals but keeps them in findings", () => {
    const rows = [
      row({ id: "a", service: "Netflix", amount: 15.49, cadence: "monthly" }),
      row({ id: "b", service: "HBO Max", amount: 16,    cadence: "monthly", active: 0, detected_intent: "cancellation" }),
    ];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.findings).toHaveLength(2);
    expect(out.summary.totalActive).toBe(1);
    expect(out.summary.totalMonthlyCost).toBe(15.49);
  });

  it("flags auto-renew-within-7d with evidence", () => {
    const rows = [row({ next_renewal_at: "2026-04-24" })];
    const out = auditSubscriptions(rows, { now: NOW });
    const flag = out.findings[0]!.flags.find((f) => f.kind === "auto-renew-within-7d");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("warn");
    expect(flag!.evidence).toContain("2026-04-24");
  });

  it("flags auto-renew-within-window at info severity for renewals further out", () => {
    const rows = [row({ next_renewal_at: "2026-05-15" })];
    const out = auditSubscriptions(rows, { now: NOW, windowDays: 30 });
    const flag = out.findings[0]!.flags.find((f) => f.kind === "auto-renew-within-window");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("info");
  });

  it("flags trial-ending when intent is trial-ending", () => {
    const rows = [row({ detected_intent: "trial-ending", next_renewal_at: "2026-04-26" })];
    const out = auditSubscriptions(rows, { now: NOW });
    const flag = out.findings[0]!.flags.find((f) => f.kind === "trial-ending");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("warn");
  });

  it("flags above-category-median when monthly cost exceeds 1.5x the category median", () => {
    const rows = [
      row({ id: "a", service: "Netflix Premium", amount: 22.99, cadence: "monthly" }),
    ];
    const out = auditSubscriptions(rows, { now: NOW });
    const flag = out.findings[0]!.flags.find((f) => f.kind === "above-category-median");
    expect(flag).toBeDefined();
    expect(flag!.evidence).toContain("streaming");
  });

  it("does NOT flag above-category-median when cost is near the category median", () => {
    const rows = [row({ service: "Netflix", amount: 10.99, cadence: "monthly" })];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.findings[0]!.flags.some((f) => f.kind === "above-category-median")).toBe(false);
  });

  it("flags unknown-cadence for active rows with no cadence", () => {
    const rows = [row({ cadence: null })];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.findings[0]!.flags.some((f) => f.kind === "unknown-cadence")).toBe(true);
  });

  it("flags stale-no-renewal-info for active rows with no renewal date + old last-seen", () => {
    const rows = [row({
      next_renewal_at: null,
      last_seen: "2026-01-01T00:00:00.000Z", // > 60 days before NOW
    })];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.findings[0]!.flags.some((f) => f.kind === "stale-no-renewal-info")).toBe(true);
  });

  it("flags recent-cancellation-detected for inactive cancellation intent", () => {
    const rows = [row({ active: 0, detected_intent: "cancellation" })];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.findings[0]!.flags.some((f) => f.kind === "recent-cancellation-detected")).toBe(true);
  });

  it("resolves recommendation to urgent when >= 2 subs renew within 7d", () => {
    const rows = [
      row({ id: "a", service: "Netflix",   next_renewal_at: "2026-04-24" }),
      row({ id: "b", service: "Spotify",   next_renewal_at: "2026-04-25" }),
    ];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.recommendation.band).toBe("urgent");
    expect(out.recommendation.oneLiner).toContain("2 subscriptions");
  });

  it("resolves recommendation to urgent when a trial is ending", () => {
    const rows = [row({ detected_intent: "trial-ending", next_renewal_at: "2026-04-26" })];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.recommendation.band).toBe("urgent");
    expect(out.recommendation.oneLiner).toContain("trial");
  });

  it("resolves recommendation to review when exactly 1 sub renews within 7d", () => {
    const rows = [row({ next_renewal_at: "2026-04-24" })];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.recommendation.band).toBe("review");
  });

  it("resolves recommendation to review when above-median alone fires", () => {
    const rows = [row({
      service: "Netflix Premium",
      amount: 25,
      cadence: "monthly",
      next_renewal_at: "2027-01-01",  // far in future → no renew-soon flag
    })];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.recommendation.band).toBe("review");
    expect(out.recommendation.oneLiner).toMatch(/above|pricing/i);
  });

  it("resolves recommendation to all-good when nothing fires", () => {
    const rows = [row({
      service: "Spotify",
      amount: 10.99,
      cadence: "monthly",
      next_renewal_at: "2027-01-01",
    })];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.recommendation.band).toBe("all-good");
  });

  it("counts flaggedCount as only warn+blocker, not info", () => {
    const rows = [
      row({ id: "a", next_renewal_at: "2026-04-24" }),  // warn
      row({ id: "b", service: "Spotify", amount: 10.99, next_renewal_at: "2027-01-01" }), // no flags
    ];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.summary.flaggedCount).toBe(1);
  });

  it("counts upcomingRenewals as sum of within-7d + within-window", () => {
    const rows = [
      row({ id: "a", next_renewal_at: "2026-04-24" }),  // 2 days — within-7d
      row({ id: "b", service: "Spotify", next_renewal_at: "2026-05-15" }), // 23 days — within-window
    ];
    const out = auditSubscriptions(rows, { now: NOW, windowDays: 30 });
    expect(out.summary.upcomingRenewals).toBe(2);
  });

  it("sets cancelDraftable=true for active rows, false for inactive", () => {
    const rows = [
      row({ id: "a", active: 1 }),
      row({ id: "b", active: 0 }),
    ];
    const out = auditSubscriptions(rows, { now: NOW });
    expect(out.findings[0]!.cancelDraftable).toBe(true);
    expect(out.findings[1]!.cancelDraftable).toBe(false);
  });

  it("handles a 5-sub mixed-cadence fixture (acceptance criteria)", () => {
    const rows = [
      row({ id: "a", service: "Netflix",              amount: 15.49, cadence: "monthly",    next_renewal_at: "2026-04-24" }),
      row({ id: "b", service: "Spotify Premium",      amount: 10.99, cadence: "monthly",    next_renewal_at: "2026-04-28" }),
      row({ id: "c", service: "Adobe Creative Cloud", amount: 54.99, cadence: "monthly",    next_renewal_at: "2026-05-10" }),
      row({ id: "d", service: "Amazon Prime",         amount: 139,   cadence: "yearly",     next_renewal_at: "2027-01-10" }),
      row({ id: "e", service: "Peloton App",          amount: 36,    cadence: "quarterly",  next_renewal_at: null, last_seen: "2026-01-01T00:00:00.000Z" }),
    ];
    const out = auditSubscriptions(rows, { now: NOW, windowDays: 30 });
    expect(out.summary.totalActive).toBe(5);
    // 15.49 + 10.99 + 54.99 + (139/12=11.583) + (36/3=12) = 105.053 → 105.05
    expect(out.summary.totalMonthlyCost).toBeCloseTo(105.05, 2);
    // Three have 7-day or 30-day window flags
    expect(out.summary.upcomingRenewals).toBeGreaterThanOrEqual(2);
  });
});
