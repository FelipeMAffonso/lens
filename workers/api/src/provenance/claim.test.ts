import { describe, expect, it } from "vitest";
import { htmlToText, verifyClaim } from "./claim.js";

describe("htmlToText", () => {
  it("strips scripts + styles + tags", () => {
    const html = `<html><head><style>body{color:red}</style><script>alert(1)</script></head><body><h1>Hello</h1> world</body></html>`;
    expect(htmlToText(html)).toBe("Hello world");
  });
  it("collapses whitespace", () => {
    expect(htmlToText("a\n\n  b   c")).toBe("a b c");
  });
  it("decodes a small subset of entities", () => {
    expect(htmlToText("<p>Ben &amp; Jerry&#39;s</p>")).toContain("Ben & Jerry's");
  });
});

describe("verifyClaim", () => {
  const html = `
    <html><body>
      <h1>Breville Bambino Plus Review</h1>
      <p>The Breville Bambino Plus is a 15-bar Italian pump machine with automatic milk frothing.</p>
      <p>It takes only 3 seconds to heat up, and lets you pour latte art at home.</p>
    </body></html>`;

  it("exact phrase match (case-insensitive)", () => {
    const r = verifyClaim(html, "15-bar Italian pump machine");
    expect(r.via).toBe("exact");
    expect(r.snippet).toContain("Italian pump");
  });

  it("normalized match (punctuation collapsed)", () => {
    const r = verifyClaim(html, "15 bar italian, pump machine");
    expect(r.via).toBe("normalized");
  });

  it("partial-sentence match via token overlap", () => {
    const r = verifyClaim(
      html,
      "This machine offers automatic milk frothing features with heating in three seconds!",
    );
    expect(["partial-sentence", "exact", "normalized"]).toContain(r.via);
  });

  it("returns 'none' when nothing overlaps meaningfully", () => {
    const r = verifyClaim(html, "This laptop has 32GB unified memory and ProMotion display.");
    expect(r.via).toBe("none");
  });

  it("returns 'none' for empty html", () => {
    expect(verifyClaim("", "anything").via).toBe("none");
  });

  it("returns 'none' for empty claim", () => {
    expect(verifyClaim(html, "  ").via).toBe("none");
  });
});
