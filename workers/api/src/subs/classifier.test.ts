import { describe, expect, it } from "vitest";
import {
  classifyMessage,
  extractAmount,
  extractCadence,
  extractNextRenewal,
} from "./classifier.js";
import type { ClassifierResult, GmailMessage } from "./types.js";

function ok(r: ClassifierResult): r is Exclude<ClassifierResult, { matched: false }> {
  return r.matched === true;
}

function matched(r: ClassifierResult) {
  if (!ok(r)) throw new Error(`expected matched, got unmatched: ${r.reason}`);
  return r;
}

describe("classifyMessage — positive fixtures", () => {
  it("Netflix renewal by sender + keyword", () => {
    const msg: GmailMessage = {
      id: "m-1",
      from: "info@netflix.com",
      subject: "Your Netflix subscription has been renewed",
      bodyText:
        "Hi Sarah, your Netflix Premium subscription has been renewed. You have been charged $22.99. Next billing date: May 22, 2026.",
      receivedAt: "2026-04-22T12:00:00Z",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("Netflix");
    expect(r.intent).toBe("renewal");
    expect(r.amount).toBe(22.99);
    expect(r.cadence).toBe("monthly");
    expect(r.nextRenewalAt).toBe("2026-05-22");
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("Spotify Premium monthly renewal", () => {
    const msg: GmailMessage = {
      from: "no-reply@spotify.com",
      subject: "Your Premium plan renews soon",
      bodyText: "Your Spotify Premium subscription renews on 2026-05-10 for $11.99 per month.",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("Spotify Premium");
    expect(r.cadence).toBe("monthly");
    expect(r.amount).toBe(11.99);
    expect(r.nextRenewalAt).toBe("2026-05-10");
  });

  it("New York Times yearly subscription", () => {
    const msg: GmailMessage = {
      from: "noreply@email.nytimes.com",
      subject: "Your NYT subscription is due for renewal",
      bodyText: "Your annual NYT subscription renews on May 1, 2026. You will be charged $195.00 per year.",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("The New York Times");
    expect(r.cadence).toBe("yearly");
    expect(r.amount).toBe(195);
  });

  it("Max (HBO) billing date", () => {
    const msg: GmailMessage = {
      from: "billing@mail.wbd.com",
      subject: "Max - your next billing date",
      bodyText: "Your Max subscription renews on April 30, 2026 for $15.99/month.",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("Max");
    expect(r.amount).toBe(15.99);
  });

  it("Adobe Creative Cloud renewal", () => {
    const msg: GmailMessage = {
      from: "mail@mail.adobe.com",
      subject: "Your subscription payment was processed",
      bodyText: "Your Creative Cloud All Apps subscription has been renewed. Amount billed: $54.99 per month.",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("Adobe Creative Cloud");
    expect(r.intent).toBe("renewal");
    expect(r.amount).toBe(54.99);
  });

  it("DoorDash DashPass monthly", () => {
    const msg: GmailMessage = {
      from: "no-reply@message.doordash.com",
      subject: "Your DashPass monthly renewal",
      bodyText: "Your DashPass subscription renews today for $9.99 per month.",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("DoorDash DashPass");
    expect(r.cadence).toBe("monthly");
  });

  it("Amazon Prime annual", () => {
    const msg: GmailMessage = {
      from: "auto-confirm@amazon.com",
      subject: "Thanks for renewing your Prime membership",
      bodyText: "Your Amazon Prime annual subscription has been renewed. $139.00 per year.",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("Amazon Prime");
    expect(r.intent).toBe("renewal");
    expect(r.amount).toBe(139);
  });

  it("Dropbox Plus renewal", () => {
    const msg: GmailMessage = {
      from: "no-reply@dropbox.com",
      subject: "Your Dropbox Plus plan auto-renewal",
      bodyText: "Your Dropbox Plus subscription auto-renews on 6/15/2026 at $11.99/mo.",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("Dropbox Plus");
    expect(r.nextRenewalAt).toBe("2026-06-15");
  });

  it("Peloton App weekly tryout (no amount)", () => {
    const msg: GmailMessage = {
      from: "hello@email.onepeloton.com",
      subject: "Your Peloton subscription renews next week",
      bodyText: "Your Peloton App subscription renews on Apr 29 for the next billing cycle.",
      receivedAt: "2026-04-22T00:00:00Z",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("Peloton App");
    expect(r.nextRenewalAt).toBe("2026-04-29");
  });

  it("Apple iCloud+ storage plan (US)", () => {
    const msg: GmailMessage = {
      from: "no_reply@apple.com",
      subject: "Your iCloud+ storage plan",
      bodyText: "Your iCloud+ 200GB storage plan auto-renews on 2026-05-12 for $2.99 per month.",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("Apple One / iCloud+");
    expect(r.amount).toBe(2.99);
  });

  it("Hulu trial-ending intent", () => {
    const msg: GmailMessage = {
      from: "noreply@notifications.hulu.com",
      subject: "Your Hulu trial ends in 3 days",
      bodyText: "Your free trial ends on Apr 25, 2026. After that, you will be charged $7.99 per month.",
    };
    const r = matched(classifyMessage(msg));
    expect(r.service).toBe("Hulu");
    expect(r.intent).toBe("trial-ending");
  });
});

describe("classifyMessage — negative controls", () => {
  it("Amazon order confirmation is NOT a subscription", () => {
    const msg: GmailMessage = {
      from: "auto-confirm@amazon.com",
      subject: "Your order has shipped",
      bodyText: "We've shipped your order #123-456 for $29.99. Delivery expected Apr 24.",
    };
    const r = classifyMessage(msg);
    expect(r.matched).toBe(false);
  });

  it("Marketing blast is not a subscription (even from known sender)", () => {
    const msg: GmailMessage = {
      from: "news@netflix.com",
      subject: "New releases this week on Netflix",
      bodyText: "Top picks for you today — limited time offer.",
    };
    const r = classifyMessage(msg);
    expect(r.matched).toBe(false);
  });

  it("Bank statement is NOT a subscription", () => {
    const msg: GmailMessage = {
      from: "statements@bank.com",
      subject: "Your monthly statement is ready",
      bodyText: "Your statement is available. Balance: $12,345.67.",
    };
    const r = classifyMessage(msg);
    expect(r.matched).toBe(false);
  });

  it("unknown sender without subscription keywords", () => {
    const msg: GmailMessage = {
      from: "hello@randomstartup.io",
      subject: "Welcome to our app",
      bodyText: "Glad to have you here.",
    };
    expect(classifyMessage(msg).matched).toBe(false);
  });
});

describe("extractAmount", () => {
  it("reads $/month pattern", () => {
    expect(extractAmount("Your plan renews for $11.99/month")).toBe(11.99);
  });
  it("reads explicit 'charged' amount", () => {
    expect(extractAmount("You will be charged $22.50")).toBe(22.5);
  });
  it("skips < $1 orphan amounts", () => {
    expect(extractAmount("A $0.99 upgrade is available")).toBeUndefined();
  });
  it("returns undefined when nothing found", () => {
    expect(extractAmount("Hello world")).toBeUndefined();
  });
});

describe("extractCadence", () => {
  it("monthly patterns", () => {
    expect(extractCadence("per month")).toBe("monthly");
    expect(extractCadence("each month")).toBe("monthly");
    expect(extractCadence("$10/mo")).toBe("monthly");
  });
  it("yearly patterns", () => {
    expect(extractCadence("per year")).toBe("yearly");
    expect(extractCadence("annually")).toBe("yearly");
  });
  it("weekly patterns", () => {
    expect(extractCadence("per week")).toBe("weekly");
  });
  it("quarterly patterns", () => {
    expect(extractCadence("every 3 months")).toBe("quarterly");
  });
  it("returns undefined when no cadence", () => {
    expect(extractCadence("just a one-time thing")).toBeUndefined();
  });
});

describe("extractNextRenewal", () => {
  it("parses ISO date in body", () => {
    expect(extractNextRenewal("Renews on 2026-05-12")).toBe("2026-05-12");
  });
  it("parses US-formatted slash date", () => {
    expect(extractNextRenewal("Renews 5/12/2026")).toBe("2026-05-12");
  });
  it("parses long-form date with year", () => {
    expect(extractNextRenewal("Next billing date: May 12, 2026")).toBe("2026-05-12");
  });
  it("inherits year from receivedAt when missing", () => {
    expect(extractNextRenewal("Renews on May 12", "2026-04-22T00:00:00Z")).toBe("2026-05-12");
  });
  it("rolls forward year when long-date is in the past", () => {
    expect(extractNextRenewal("Renews on Jan 5", "2026-11-01T00:00:00Z")).toBe("2027-01-05");
  });
  it("handles 'in N days' relative dates", () => {
    expect(extractNextRenewal("Renews in 7 days", "2026-04-22T00:00:00Z")).toBe("2026-04-29");
  });
});
