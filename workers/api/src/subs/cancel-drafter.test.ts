import { describe, expect, it } from "vitest";
import { renderCancelDraft, type CancelDraftTemplate } from "./cancel-drafter.js";
import type { SubscriptionRow } from "./types.js";

const TEMPLATE: CancelDraftTemplate = {
  subject: "Cancellation request — {service_name}",
  bodyTemplate: [
    "Dear {service_name},",
    "",
    "I am requesting cancellation of my subscription effective {cancel_date}.",
    "",
    "Account details:",
    "  Email / username: {user_identifier}",
    "  Subscription: {plan_name}",
    "  Signup date: {signup_date}",
    "",
    "{state_law_citation}",
    "",
    "If cancellation is not completed, I reserve the right to file a complaint with {enforcement_agency}.",
    "",
    "Sincerely,",
    "{user_name}",
  ].join("\n"),
  stateLawSnippets: {
    CA: "Under California Business & Professions Code §17602 (SB-313), my online-signup subscription is entitled to online cancellation through the same channel I signed up.",
    NY: "Under New York General Business Law §527-a, my online-signup subscription is entitled to online cancellation.",
    IL: "Under the Illinois Automatic Contract Renewal Act, online-signup subscriptions must provide an online cancellation mechanism.",
    VT: "Under Vermont 9 V.S.A. §2454a, online subscription services must provide online cancellation.",
    DEFAULT: "I request cancellation through a simple online mechanism matching the signup channel, consistent with consumer-protection standards emerging in US state law.",
  },
};

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
    first_seen: "2024-02-14T00:00:00.000Z",
    last_seen: "2026-04-22T00:00:00.000Z",
    raw_payload_json: null,
    ...over,
  };
}

describe("renderCancelDraft", () => {
  it("renders subject + body with service name substituted", () => {
    const out = renderCancelDraft(row(), TEMPLATE, {
      userState: "CA",
      userName: "Jane Doe",
      userIdentifier: "jane@example.com",
      planName: "Standard with Ads",
      signupDate: "2024-02-14",
      cancelDate: "2026-04-23",
    });
    expect(out.subject).toBe("Cancellation request — Netflix");
    expect(out.body).toContain("Dear Netflix,");
    expect(out.body).toContain("effective 2026-04-23");
    expect(out.body).toContain("Email / username: jane@example.com");
    expect(out.body).toContain("Subscription: Standard with Ads");
    expect(out.body).toContain("Signup date: 2024-02-14");
    expect(out.body).toContain("Sincerely,\nJane Doe");
  });

  it("selects the CA state-law snippet and California AG", () => {
    const out = renderCancelDraft(row(), TEMPLATE, { userState: "CA" });
    expect(out.stateLaw.state).toBe("CA");
    expect(out.stateLaw.citation).toContain("SB-313");
    expect(out.enforcementAgency).toContain("California");
    expect(out.body).toContain("SB-313");
  });

  it("selects the NY state-law snippet and NY Consumer Protection", () => {
    const out = renderCancelDraft(row(), TEMPLATE, { userState: "NY" });
    expect(out.stateLaw.state).toBe("NY");
    expect(out.stateLaw.citation).toContain("§527-a");
    expect(out.enforcementAgency).toContain("New York");
  });

  it("selects IL snippet and IL AG", () => {
    const out = renderCancelDraft(row(), TEMPLATE, { userState: "IL" });
    expect(out.stateLaw.state).toBe("IL");
    expect(out.enforcementAgency).toContain("Illinois");
  });

  it("selects VT snippet and VT AG", () => {
    const out = renderCancelDraft(row(), TEMPLATE, { userState: "VT" });
    expect(out.stateLaw.state).toBe("VT");
    expect(out.enforcementAgency).toContain("Vermont");
  });

  it("falls back to DEFAULT snippet and FTC when state is unknown", () => {
    const out = renderCancelDraft(row(), TEMPLATE, { userState: "OK" });
    expect(out.stateLaw.state).toBe("DEFAULT");
    expect(out.enforcementAgency).toContain("Federal Trade Commission");
  });

  it("falls back to DEFAULT snippet when userState is omitted", () => {
    const out = renderCancelDraft(row(), TEMPLATE, {});
    expect(out.stateLaw.state).toBe("DEFAULT");
    expect(out.enforcementAgency).toContain("Federal Trade Commission");
  });

  it("surfaces [TODO: user_name] when userName is omitted", () => {
    const out = renderCancelDraft(row(), TEMPLATE, { userState: "CA" });
    expect(out.body).toContain("[TODO: user_name]");
  });

  it("surfaces [TODO: user_identifier] when userIdentifier is omitted", () => {
    const out = renderCancelDraft(row(), TEMPLATE, { userState: "CA", userName: "Jane" });
    expect(out.body).toContain("[TODO: user_identifier]");
  });

  it("defaults planName to service name when planName omitted", () => {
    const out = renderCancelDraft(row(), TEMPLATE, { userState: "CA" });
    expect(out.body).toContain("Subscription: Netflix");
  });

  it("defaults signupDate to first_seen slice when signupDate omitted", () => {
    const out = renderCancelDraft(row(), TEMPLATE, {});
    expect(out.body).toContain("Signup date: 2024-02-14");
  });

  it("defaults cancelDate to today (ISO YYYY-MM-DD) when cancelDate omitted", () => {
    const out = renderCancelDraft(row(), TEMPLATE, {});
    const today = new Date().toISOString().slice(0, 10);
    expect(out.body).toContain(`effective ${today}`);
  });

  it("is case-insensitive for userState", () => {
    const out = renderCancelDraft(row(), TEMPLATE, { userState: "ca" });
    expect(out.stateLaw.state).toBe("CA");
    expect(out.enforcementAgency).toContain("California");
  });

  it("returns format email and to=null (the user fills to: manually)", () => {
    const out = renderCancelDraft(row(), TEMPLATE, {});
    expect(out.format).toBe("email");
    expect(out.to).toBeNull();
  });

  it("emits every resolved token in the tokens map", () => {
    const out = renderCancelDraft(row(), TEMPLATE, {
      userState: "CA",
      userName: "Jane",
      userIdentifier: "jane@example.com",
      planName: "Standard",
      signupDate: "2024-02-14",
      cancelDate: "2026-04-23",
    });
    expect(out.tokens["service_name"]).toBe("Netflix");
    expect(out.tokens["user_name"]).toBe("Jane");
    expect(out.tokens["user_identifier"]).toBe("jane@example.com");
    expect(out.tokens["plan_name"]).toBe("Standard");
    expect(out.tokens["signup_date"]).toBe("2024-02-14");
    expect(out.tokens["cancel_date"]).toBe("2026-04-23");
    expect(out.tokens["state_law_citation"]).toContain("SB-313");
    expect(out.tokens["enforcement_agency"]).toContain("California");
  });
});
