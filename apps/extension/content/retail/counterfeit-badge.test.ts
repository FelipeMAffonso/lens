import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deriveCategory,
  detectMarketplace,
  isMarketplaceListing,
  postCounterfeitCheck,
  priceAnchor,
  renderBadge,
  scrapeListing,
  type CounterfeitResponse,
  type ListingSnapshot,
} from "./counterfeit-badge.js";

describe("detectMarketplace", () => {
  it("detects eBay item pages", () => {
    expect(detectMarketplace(new URL("https://www.ebay.com/itm/123456789"))).toBe("ebay");
    expect(detectMarketplace(new URL("https://ebay.co.uk/itm/abc"))).toBe("ebay");
  });

  it("detects Amazon 3P seller contexts", () => {
    expect(detectMarketplace(new URL("https://www.amazon.com/sp?ie=UTF8&seller=A123"))).toBe("amazon-3p");
    expect(detectMarketplace(new URL("https://www.amazon.com/dp/B0ABC?m=A1B2"))).toBe("amazon-3p");
    expect(detectMarketplace(new URL("https://www.amazon.com/dp/B0ABC?smid=A1B2"))).toBe("amazon-3p");
  });

  it("detects Facebook Marketplace", () => {
    expect(
      detectMarketplace(new URL("https://www.facebook.com/marketplace/item/9988776655")),
    ).toBe("fb-marketplace");
  });

  it("detects Walmart 3P", () => {
    expect(detectMarketplace(new URL("https://www.walmart.com/seller/555"))).toBe("walmart-3p");
    expect(detectMarketplace(new URL("https://www.walmart.com/ip/foo/123?sellerId=abc"))).toBe(
      "walmart-3p",
    );
  });

  it("detects Mercari items", () => {
    expect(detectMarketplace(new URL("https://www.mercari.com/us/item/m123456789/"))).toBe("mercari");
  });

  it("rejects generic retailer / non-marketplace pages", () => {
    expect(detectMarketplace(new URL("https://www.amazon.com/dp/B0G1MRLXMV"))).toBeNull();
    expect(detectMarketplace(new URL("https://www.ebay.com/"))).toBeNull();
    expect(detectMarketplace(new URL("https://www.walmart.com/ip/foo/123"))).toBeNull();
    expect(detectMarketplace(new URL("https://www.target.com/p/foo/A-123"))).toBeNull();
    expect(detectMarketplace(new URL("https://lens-b1h.pages.dev/"))).toBeNull();
  });
});

describe("isMarketplaceListing", () => {
  it("wraps detectMarketplace and returns boolean", () => {
    expect(isMarketplaceListing(new URL("https://www.ebay.com/itm/42"))).toBe(true);
    expect(isMarketplaceListing(new URL("https://example.com/"))).toBe(false);
  });
});

describe("scrapeListing (unit — seeded DOM)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("ebay: extracts title + price + feedbackCount when data-hook markup present", () => {
    document.body.innerHTML = `
      <h1 class="x-item-title"><span class="ux-textspans">Nike Air Max 90 SE — new</span></h1>
      <div class="x-price-primary"><span class="ux-textspans">US $89.99</span></div>
      <div data-testid="ux-seller-section__item--feedback-count">(1,245)</div>
    `;
    const snap = scrapeListing("ebay");
    expect(snap).not.toBeNull();
    expect(snap?.productName).toContain("Nike Air Max");
    expect(snap?.price).toBe(89.99);
    expect(snap?.feedbackCount).toBe(1245);
  });

  it("ebay: returns partial snapshot when only price is available", () => {
    document.body.innerHTML = `<span id="prcIsum">$49.50</span>`;
    const snap = scrapeListing("ebay");
    expect(snap?.price).toBe(49.5);
    expect(snap?.productName).toBeUndefined();
  });

  it("amazon-3p: extracts title + price + feedback + since → sellerAgeDays", () => {
    document.body.innerHTML = `
      <span id="productTitle">De'Longhi Stilosa Espresso Machine</span>
      <div id="corePriceDisplay_desktop_feature_div"><span class="a-offscreen">$129.95</span></div>
      <div id="feedback-summary-table"><a class="feedback-link">(3,421 ratings)</a></div>
      <div id="from">since January 2020</div>
    `;
    const snap = scrapeListing("amazon-3p");
    expect(snap?.productName).toContain("Stilosa");
    expect(snap?.price).toBe(129.95);
    expect(snap?.feedbackCount).toBe(3421);
    expect(snap?.sellerAgeDays).toBeGreaterThan(365 * 5);
  });

  it("amazon-3p: builds feedbackDistribution histogram from data-rating rows", () => {
    document.body.innerHTML = `
      <div id="feedback-summary-table">
        <div class="a-histogram-row" data-rating="5"><span class="a-text-right">6000</span></div>
        <div class="a-histogram-row" data-rating="4"><span class="a-text-right">150</span></div>
        <div class="a-histogram-row" data-rating="3"><span class="a-text-right">80</span></div>
        <div class="a-histogram-row" data-rating="2"><span class="a-text-right">50</span></div>
        <div class="a-histogram-row" data-rating="1"><span class="a-text-right">2500</span></div>
      </div>
    `;
    const snap = scrapeListing("amazon-3p");
    expect(snap?.feedbackDistribution?.star5).toBe(6000);
    expect(snap?.feedbackDistribution?.star1).toBe(2500);
    // Classic bimodal signature (sparse 2-3-4 middle).
    expect(snap?.feedbackDistribution?.star3).toBe(80);
  });

  it("walmart-3p: extracts title + price + rating count", () => {
    document.body.innerHTML = `
      <h1 itemprop="name">Bose QC45 Headphones</h1>
      <span data-automation-id="product-price">$219.00</span>
      <span data-automation-id="rating-count">(87)</span>
    `;
    const snap = scrapeListing("walmart-3p");
    expect(snap?.productName).toContain("Bose");
    expect(snap?.price).toBe(219);
    expect(snap?.feedbackCount).toBe(87);
  });

  it("mercari: extracts title + price + feedback", () => {
    document.body.innerHTML = `
      <h1 data-testid="ItemDetailsTitle">Louis Vuitton Neverfull MM</h1>
      <div data-testid="ItemDetailsPrice">$780</div>
      <div data-testid="ItemDetailsSellerRatings">(34 ratings)</div>
    `;
    const snap = scrapeListing("mercari");
    expect(snap?.productName).toContain("Louis Vuitton");
    expect(snap?.price).toBe(780);
    expect(snap?.feedbackCount).toBe(34);
  });

  it("fb-marketplace: extracts title + price from main region", () => {
    document.body.innerHTML = `
      <div role="main">
        <h1 role="heading">Apple Watch Series 9 - barely used</h1>
        <div>Listed by Someone</div>
        <div>$299</div>
      </div>
    `;
    const snap = scrapeListing("fb-marketplace");
    expect(snap?.productName).toContain("Apple Watch");
    expect(snap?.price).toBe(299);
  });
});

describe("priceAnchor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("ebay: returns the x-price-primary anchor", () => {
    document.body.innerHTML = `<div class="x-price-primary"><span>US $10</span></div>`;
    expect(priceAnchor("ebay")).not.toBeNull();
  });

  it("returns null when no anchor exists", () => {
    for (const m of ["ebay", "amazon-3p", "fb-marketplace", "walmart-3p", "mercari"] as const) {
      expect(priceAnchor(m)).toBeNull();
    }
  });

  it("mercari + walmart-3p: anchor by data-testid / data-automation-id", () => {
    document.body.innerHTML = `<div data-testid="ItemDetailsPrice">$10</div>`;
    expect(priceAnchor("mercari")).not.toBeNull();
    document.body.innerHTML = `<span data-automation-id="product-price">$10</span>`;
    expect(priceAnchor("walmart-3p")).not.toBeNull();
  });
});

describe("renderBadge", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="anchor"></div>';
  });

  const authentic: CounterfeitResponse = {
    host: "ebay.com",
    verdict: "authentic",
    riskScore: 5,
    signals: [
      { id: "seller-age", verdict: "ok", detail: "seller 3+ years old" },
      { id: "feedback-volume", verdict: "ok", detail: "1,245 feedback entries" },
    ],
    generatedAt: new Date().toISOString(),
  };

  const caution: CounterfeitResponse = {
    host: "ebay.com",
    verdict: "caution",
    riskScore: 55,
    signals: [
      {
        id: "feedback-distribution-bimodal",
        verdict: "warn",
        detail: "feedback distribution 22% 1-star + 64% 5-star — bimodal",
      },
      { id: "seller-age", verdict: "warn", detail: "seller 72 days old (< 90 day floor)" },
    ],
    generatedAt: new Date().toISOString(),
  };

  const counterfeit: CounterfeitResponse = {
    host: "ebay.com",
    verdict: "likely-counterfeit",
    riskScore: 95,
    signals: [
      {
        id: "price-too-low",
        verdict: "fail",
        detail: "$39 listed vs $300 category floor (less than 1/3)",
      },
      { id: "seller-age", verdict: "fail", detail: "seller 12 days old" },
      {
        id: "feedback-distribution-bimodal",
        verdict: "fail",
        detail: "15% 1-star + 78% 5-star — classic bimodal pattern",
      },
    ],
    generatedAt: new Date().toISOString(),
  };

  it("suppresses banner on authentic + zero warn/fail signals (silent-unless-signal)", () => {
    const anchor = document.getElementById("anchor")!;
    const host = renderBadge(authentic, anchor);
    expect(host).toBeNull();
    expect(anchor.getAttribute("data-lens-counterfeit")).toBe("1");
  });

  it("renders amber badge on caution verdict", () => {
    const anchor = document.getElementById("anchor")!;
    const host = renderBadge(caution, anchor);
    expect(host).not.toBeNull();
    expect(host?.getAttribute("data-lens")).toBe("counterfeit-host");
    expect(document.querySelector('[data-lens="counterfeit-host"]')).not.toBeNull();
  });

  it("renders red badge on likely-counterfeit with failing signals", () => {
    const anchor = document.getElementById("anchor")!;
    const host = renderBadge(counterfeit, anchor);
    expect(host).not.toBeNull();
    expect(host?.getAttribute("data-lens")).toBe("counterfeit-host");
  });

  it("refuses to double-render when a counterfeit host already exists", () => {
    const a1 = document.getElementById("anchor")!;
    renderBadge(counterfeit, a1);
    document.body.insertAdjacentHTML("beforeend", '<div id="anchor2"></div>');
    const a2 = document.getElementById("anchor2")!;
    const second = renderBadge(counterfeit, a2);
    expect(second).toBeNull();
  });
});

describe("deriveCategory (judge P0-3)", () => {
  it("matches espresso / laptop / headphones / watch / camera / tv / handbag keywords", () => {
    expect(deriveCategory("De'Longhi Stilosa Espresso Machine")).toBe("espresso-machine");
    expect(deriveCategory("MacBook Pro 14-inch")).toBe("laptop");
    expect(deriveCategory("Bose QC45 Headphones")).toBe("headphones");
    expect(deriveCategory("Apple Watch Series 9")).toBe("watch");
    expect(deriveCategory("Canon EOS R8 body")).toBe("camera");
    expect(deriveCategory("Sony OLED TV 55-inch")).toBe("tv");
    expect(deriveCategory("Louis Vuitton Neverfull MM")).toBe("handbag");
    expect(deriveCategory("Air Jordan 1 Retro")).toBe("sneakers");
  });

  it("returns undefined when no keyword matches", () => {
    expect(deriveCategory("Random mystery item")).toBeUndefined();
    expect(deriveCategory("")).toBeUndefined();
  });
});

describe("postCounterfeitCheck (judge P0-1 + P1-9 PII regression)", () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: string | null = null;

  beforeEach(() => {
    capturedBody = null;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = (init?.body as string | undefined) ?? null;
      return new Response(
        JSON.stringify({
          host: "ebay.com",
          verdict: "authentic",
          riskScore: 5,
          signals: [],
          generatedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("strips `marketplace` from the POST body so the backend strict schema doesn't 400", async () => {
    const snap: ListingSnapshot = {
      host: "ebay.com",
      marketplace: "ebay",
      price: 89.99,
      productName: "Bose QC45",
    };
    await postCounterfeitCheck(snap);
    expect(capturedBody).not.toBeNull();
    const parsed = JSON.parse(capturedBody!);
    expect("marketplace" in parsed).toBe(false);
    // Sanity: kept the other fields.
    expect(parsed.host).toBe("ebay.com");
    expect(parsed.price).toBe(89.99);
  });

  it("strips sellerName + sellerId (PII) from the POST body", async () => {
    const snap: ListingSnapshot = {
      host: "mercari.com",
      marketplace: "mercari",
      price: 150,
      sellerName: "Jane Doe",
      sellerId: "seller_abc123",
    };
    await postCounterfeitCheck(snap);
    const parsed = JSON.parse(capturedBody!);
    expect("sellerName" in parsed).toBe(false);
    expect("sellerId" in parsed).toBe(false);
  });
});
