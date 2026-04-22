import { describe, expect, it } from "vitest";
import {
  detectAffiliateFromHtml,
  detectAffiliateFromUrl,
  mergeIndicators,
} from "./affiliate.js";

describe("detectAffiliateFromUrl", () => {
  it("catches Amazon Associates tag=X-20", () => {
    const r = detectAffiliateFromUrl("https://www.amazon.com/dp/B07DKZ9GHB?tag=wirecutter-20");
    expect(r.map((i) => i.kind)).toContain("amazon-tag");
  });

  it("catches Amazon linkId + non-20 tag still counts as affiliate", () => {
    const r = detectAffiliateFromUrl("https://www.amazon.com/dp/x?tag=tst&linkId=abc");
    const kinds = r.map((i) => i.kind);
    expect(kinds).toContain("amazon-tag");
  });

  it("catches shareasale.com redirects", () => {
    expect(
      detectAffiliateFromUrl("https://shareasale.com/r.cfm?b=123&u=456").map((i) => i.kind),
    ).toContain("share-a-sale");
  });

  it("catches awin1 redirects", () => {
    expect(
      detectAffiliateFromUrl("https://www.awin1.com/cread.php?awinmid=1234&awinaffid=5678").map(
        (i) => i.kind,
      ),
    ).toContain("awin");
  });

  it("catches Rakuten linksynergy", () => {
    expect(
      detectAffiliateFromUrl("https://click.linksynergy.com/deeplink?id=xyz&mid=123").map(
        (i) => i.kind,
      ),
    ).toContain("rakuten");
  });

  it("catches skimresources redirects", () => {
    expect(
      detectAffiliateFromUrl("https://go.skimresources.com/?id=abc&url=https%3A%2F%2Fexample.com"),
    ).toHaveLength(1);
  });

  it("catches impact-affiliate paths", () => {
    expect(
      detectAffiliateFromUrl("https://example.com/impact-affiliate/?ref=xyz").map((i) => i.kind),
    ).toContain("impact-radius");
  });

  it("catches utm_source=affiliate tracking", () => {
    expect(
      detectAffiliateFromUrl("https://example.com/x?utm_source=affiliate").map((i) => i.kind),
    ).toContain("utm-tracking");
  });

  it("returns empty for clean URLs", () => {
    expect(detectAffiliateFromUrl("https://wirecutter.com/reviews/best-laptop-for-students/")).toEqual([]);
  });

  it("returns empty for malformed URLs", () => {
    expect(detectAffiliateFromUrl("not a url")).toEqual([]);
  });
});

describe("detectAffiliateFromHtml", () => {
  it("flags rel=sponsored anchors", () => {
    const html = `<a href="https://x" rel="sponsored">sponsored link</a>`;
    expect(detectAffiliateFromHtml(html).map((i) => i.kind)).toContain("rel-sponsored");
  });

  it("picks up FTC disclosure phrases", () => {
    const html = `<p>As an Amazon Associate, we may earn a commission on purchases.</p>`;
    const r = detectAffiliateFromHtml(html);
    expect(r.map((i) => i.kind)).toContain("sponsored-disclosure");
  });

  it("detects body-embedded Amazon tag links", () => {
    const html = `<a href="https://www.amazon.com/dp/B07?tag=site-20">link</a>`;
    expect(detectAffiliateFromHtml(html).map((i) => i.kind)).toContain("amazon-tag");
  });

  it("detects body-embedded shareasale redirects", () => {
    const html = `<a href="https://www.shareasale.com/r.cfm?b=123&u=456">buy</a>`;
    expect(detectAffiliateFromHtml(html).map((i) => i.kind)).toContain("share-a-sale");
  });

  it("returns empty for clean HTML", () => {
    expect(detectAffiliateFromHtml("<p>Plain review with no affiliate markers.</p>")).toEqual([]);
  });
});

describe("mergeIndicators", () => {
  it("deduplicates by (kind, detail) composite", () => {
    const a = [
      { kind: "amazon-tag", detail: "Amazon tag=xxx" } as const,
      { kind: "amazon-tag", detail: "Amazon tag=xxx" } as const,
    ];
    const b = [{ kind: "rel-sponsored", detail: "1 rel=sponsored anchor" } as const];
    expect(mergeIndicators(a, b)).toHaveLength(2);
  });
});
