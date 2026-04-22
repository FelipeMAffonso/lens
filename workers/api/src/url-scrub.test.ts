import { describe, expect, it } from "vitest";
import { scrubCandidateUrls, scrubTrackingParams } from "./url-scrub.js";

describe("scrubTrackingParams", () => {
  it("strips Amazon affiliate params (tag, ref, linkcode, ascsubtag)", () => {
    const raw = "https://www.amazon.com/dp/B08N5WRWNW?tag=lens-20&ref=cm_sw_r&linkCode=ll1&ascsubtag=abc";
    expect(scrubTrackingParams(raw)).toBe("https://www.amazon.com/dp/B08N5WRWNW");
  });

  it("strips UTM params", () => {
    const raw = "https://breville.com/us/en/bambino-plus?utm_source=google&utm_medium=cpc&utm_campaign=spring";
    expect(scrubTrackingParams(raw)).toBe("https://breville.com/us/en/bambino-plus");
  });

  it("strips ShareASale + Rakuten + Impact + CJ params", () => {
    const raw =
      "https://example.com/item?afftrack=x&sscid=y&irclickid=z&ranMID=w&cjevent=q&impactid=r&clickid=s";
    expect(scrubTrackingParams(raw)).toBe("https://example.com/item");
  });

  it("strips Google gclid + fbclid + msclkid", () => {
    const raw = "https://example.com/p?gclid=A&fbclid=B&msclkid=C&gad_source=1";
    expect(scrubTrackingParams(raw)).toBe("https://example.com/p");
  });

  it("preserves legitimate product-identifying query params (color, size, variant)", () => {
    const raw =
      "https://target.com/p/item?color=red&size=medium&variant=v1&tag=aff&utm_source=bad";
    expect(scrubTrackingParams(raw)).toBe("https://target.com/p/item?color=red&size=medium&variant=v1");
  });

  it("drops fragments (affiliate systems hide IDs in #tag=)", () => {
    const raw = "https://example.com/p?tag=foo#ref=evil";
    expect(scrubTrackingParams(raw)).toBe("https://example.com/p");
  });

  it("returns null on unparseable input", () => {
    expect(scrubTrackingParams("not a url")).toBe(null);
    expect(scrubTrackingParams("")).toBe(null);
    expect(scrubTrackingParams("   ")).toBe(null);
    expect(scrubTrackingParams(null)).toBe(null);
    expect(scrubTrackingParams(undefined)).toBe(null);
  });

  it("rejects non-http(s) schemes", () => {
    expect(scrubTrackingParams("mailto:foo@bar.com")).toBe(null);
    expect(scrubTrackingParams("javascript:alert(1)")).toBe(null);
    expect(scrubTrackingParams("data:text/html,x")).toBe(null);
    expect(scrubTrackingParams("ftp://example.com/file")).toBe(null);
  });

  it("is case-insensitive on param names (TAG, UTM_Source etc)", () => {
    const raw = "https://example.com/p?TAG=x&Utm_Source=y&Utm_Campaign=z";
    expect(scrubTrackingParams(raw)).toBe("https://example.com/p");
  });

  it("handles URLs with no query string unchanged", () => {
    expect(scrubTrackingParams("https://example.com/p")).toBe("https://example.com/p");
    expect(scrubTrackingParams("https://example.com/p/")).toBe("https://example.com/p/");
  });

  it("scrubs nested amazon partner links completely", () => {
    const raw =
      "https://www.amazon.com/dp/B08N5WRWNW/ref=nosim?tag=lens-20&linkCode=ll1&camp=1789&creative=9325&creativeASIN=B08N5WRWNW&smid=A2L77EE7U53NWQ&th=1&psc=1&_encoding=UTF8";
    const cleaned = scrubTrackingParams(raw);
    expect(cleaned).not.toMatch(/tag=|linkCode=|camp=|creative=|creativeASIN=|smid=|th=|psc=|_encoding=/);
    expect(cleaned).toMatch(/^https:\/\/www\.amazon\.com\/dp\/B08N5WRWNW/);
  });
});

describe("scrubCandidateUrls", () => {
  it("strips tracking from url AND thumbnailUrl", () => {
    const c = {
      name: "X",
      url: "https://a.com/p?tag=x&color=red",
      thumbnailUrl: "https://cdn.a.com/img.jpg?utm_source=y",
    };
    const out = scrubCandidateUrls(c);
    expect(out.url).toBe("https://a.com/p?color=red");
    expect(out.thumbnailUrl).toBe("https://cdn.a.com/img.jpg");
  });

  it("deletes url when unparseable rather than shipping garbage", () => {
    const c = { name: "X", url: "not a url" };
    const out = scrubCandidateUrls(c);
    expect(out.url).toBeUndefined();
  });

  it("passes through when no url / thumbnailUrl", () => {
    const c = { name: "X" };
    const out = scrubCandidateUrls(c);
    expect(out).toEqual({ name: "X" });
  });
});
