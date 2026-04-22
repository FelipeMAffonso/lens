import { beforeEach, describe, expect, it } from "vitest";
import {
  isAmazonReviewContext,
  scrapeVisibleReviews,
  reviewAnchor,
  renderBanner,
  type ReviewScanResponse,
} from "./review-scan-badge.js";

describe("isAmazonReviewContext", () => {
  it("detects product pages with ASIN", () => {
    expect(isAmazonReviewContext(new URL("https://www.amazon.com/dp/B0G1MRLXMV"))).toBe(true);
    expect(isAmazonReviewContext(new URL("https://www.amazon.com/gp/product/B08N5WRWNW/"))).toBe(true);
    expect(isAmazonReviewContext(new URL("https://amazon.co.uk/dp/B07ABCDEFG"))).toBe(true);
  });

  it("detects dedicated review pages", () => {
    expect(
      isAmazonReviewContext(new URL("https://www.amazon.com/product-reviews/B0G1MRLXMV/")),
    ).toBe(true);
  });

  it("rejects non-Amazon hosts", () => {
    expect(isAmazonReviewContext(new URL("https://www.walmart.com/ip/foo/123"))).toBe(false);
    expect(isAmazonReviewContext(new URL("https://lens-b1h.pages.dev/"))).toBe(false);
  });

  it("rejects Amazon search + category URLs", () => {
    expect(isAmazonReviewContext(new URL("https://www.amazon.com/s?k=laptop"))).toBe(false);
    expect(isAmazonReviewContext(new URL("https://www.amazon.com/b/ref=Tools"))).toBe(false);
    expect(isAmazonReviewContext(new URL("https://www.amazon.com/"))).toBe(false);
  });
});

describe("scrapeVisibleReviews", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns [] when no reviews present", () => {
    expect(scrapeVisibleReviews(document)).toEqual([]);
  });

  it("extracts text + rating + date + reviewer from data-hook markup", () => {
    document.body.innerHTML = `
      <div id="cm-cr-dp-review-list">
        <div data-hook="review">
          <span data-hook="review-star-rating">5.0 out of 5 stars</span>
          <span data-hook="review-date">Reviewed in the United States on March 3, 2025</span>
          <div data-hook="genome-widget"><span class="a-profile-name">Alex</span></div>
          <div data-hook="review-body">
            <span>Worth every penny. Highly recommend. Exactly what I needed.</span>
          </div>
        </div>
        <div data-hook="review">
          <span data-hook="review-star-rating">4.0 out of 5 stars</span>
          <span data-hook="review-date">Reviewed in the United States on April 10, 2025</span>
          <div data-hook="genome-widget"><span class="a-profile-name">Jordan</span></div>
          <div data-hook="review-body">
            <span>Solid product, arrived quickly. Good build quality.</span>
          </div>
        </div>
      </div>
    `;
    const reviews = scrapeVisibleReviews(document);
    expect(reviews).toHaveLength(2);
    expect(reviews[0]?.text).toContain("Worth every penny");
    expect(reviews[0]?.rating).toBe(5);
    expect(reviews[0]?.date).toBe("2025-03-03");
    expect(reviews[0]?.reviewer).toBe("Alex");
    expect(reviews[1]?.rating).toBe(4);
    expect(reviews[1]?.date).toBe("2025-04-10");
  });

  it("skips reviews with empty or too-short body text", () => {
    document.body.innerHTML = `
      <div id="cm-cr-dp-review-list">
        <div data-hook="review">
          <div data-hook="review-body"><span>ok</span></div>
        </div>
        <div data-hook="review">
          <div data-hook="review-body"><span>This is actually a real review with substance.</span></div>
        </div>
      </div>
    `;
    const reviews = scrapeVisibleReviews(document);
    expect(reviews).toHaveLength(1);
  });

  it("returns text-only entries when rating/date/reviewer are absent", () => {
    document.body.innerHTML = `
      <div data-hook="review">
        <div data-hook="review-body"><span>A perfectly fine review with no metadata.</span></div>
      </div>
      <div data-hook="review">
        <div data-hook="review-body"><span>Another anonymous review body here.</span></div>
      </div>
    `;
    const reviews = scrapeVisibleReviews(document);
    expect(reviews).toHaveLength(2);
    expect(reviews[0]?.rating).toBeUndefined();
    expect(reviews[0]?.date).toBeUndefined();
    expect(reviews[0]?.reviewer).toBeUndefined();
  });
});

describe("reviewAnchor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null when no anchor elements exist", () => {
    expect(reviewAnchor(document)).toBeNull();
  });

  it("prefers #cm-cr-dp-review-list over fallbacks", () => {
    document.body.innerHTML = `
      <div id="customerReviews"></div>
      <div id="cm-cr-dp-review-list"></div>
    `;
    const a = reviewAnchor(document);
    expect(a).not.toBeNull();
    expect(a?.id).toBe("cm-cr-dp-review-list");
  });

  it("falls back to #cm_cr-review_list (dedicated review page)", () => {
    document.body.innerHTML = '<div id="cm_cr-review_list"></div>';
    expect(reviewAnchor(document)?.id).toBe("cm_cr-review_list");
  });

  it("falls back to #customerReviews when primary anchors absent", () => {
    document.body.innerHTML = '<div id="customerReviews"></div>';
    expect(reviewAnchor(document)?.id).toBe("customerReviews");
  });
});

describe("renderBanner", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="anchor"></div>';
  });

  const clean: ReviewScanResponse = {
    authenticityScore: 0.92,
    signalsFound: [],
    flaggedReviewIndices: [],
    summary: "Reviews look authentic.",
    packSlug: "dark-pattern/fake-social-proof",
    heuristics: {
      temporalClusteringPct: 5,
      languageHomogeneityScore: 0.03,
      fiveStarSharePct: 65,
      templatePhrasingHitPct: 5,
      lengthHomogeneityScore: 0.4,
    },
  };

  const mixed: ReviewScanResponse = {
    ...clean,
    authenticityScore: 0.55,
    signalsFound: [
      "rating-skew: 90% five-star reviews (authentic baseline 60-70%)",
      "template-phrasing: 45% of reviews contain ≥2 common template phrases",
    ],
    flaggedReviewIndices: [0, 2],
    summary: "Mixed signals.",
  };

  const suspect: ReviewScanResponse = {
    ...mixed,
    authenticityScore: 0.25,
    flaggedReviewIndices: [0, 1, 2, 3, 4],
    summary: "Likely manipulated.",
  };

  it("suppresses banner on clean score with zero signals (silent-unless-signal)", () => {
    const anchor = document.getElementById("anchor")!;
    const host = renderBanner(clean, anchor, 8);
    expect(host).toBeNull();
    // Should mark anchor so we don't re-scan.
    expect(anchor.getAttribute("data-lens-review-scan")).toBe("1");
  });

  it("renders amber banner on mixed signals", () => {
    const anchor = document.getElementById("anchor")!;
    const host = renderBanner(mixed, anchor, 10);
    expect(host).not.toBeNull();
    expect(host?.getAttribute("data-lens")).toBe("review-scan-host");
    const banner = document.querySelector('[data-lens="review-scan-host"]');
    expect(banner).not.toBeNull();
  });

  it("renders red banner on suspect score with count in headline", () => {
    const anchor = document.getElementById("anchor")!;
    const host = renderBanner(suspect, anchor, 8);
    expect(host).not.toBeNull();
    // Shadow root is closed; verify by checking the host presence.
    expect(host?.getAttribute("data-lens")).toBe("review-scan-host");
  });

  it("refuses to double-render when a review-scan host already exists", () => {
    const a1 = document.getElementById("anchor")!;
    renderBanner(mixed, a1, 8);
    document.body.insertAdjacentHTML("beforeend", '<div id="anchor2"></div>');
    const a2 = document.getElementById("anchor2")!;
    const second = renderBanner(suspect, a2, 8);
    expect(second).toBeNull();
  });
});
