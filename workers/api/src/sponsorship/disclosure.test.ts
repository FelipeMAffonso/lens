import { describe, expect, it } from "vitest";
import { detectDisclosures } from "./disclosure.js";

describe("detectDisclosures", () => {
  it("catches 'As an Amazon Associate'", () => {
    const r = detectDisclosures("As an Amazon Associate, we earn from qualifying purchases.");
    expect(r.some((d) => d.kind === "ftc-affiliate")).toBe(true);
  });

  it("catches 'affiliate links'", () => {
    const r = detectDisclosures("This page contains affiliate links.");
    expect(r.some((d) => d.kind === "ftc-affiliate")).toBe(true);
  });

  it("catches 'we may earn a commission'", () => {
    const r = detectDisclosures("If you buy through our links, we may earn a commission.");
    expect(r.some((d) => d.kind === "ftc-affiliate")).toBe(true);
  });

  it("catches 'sponsored by'", () => {
    const r = detectDisclosures("This video is sponsored by Brand X.");
    expect(r.some((d) => d.kind === "sponsored-post")).toBe(true);
  });

  it("catches hashtag #sponsored", () => {
    const r = detectDisclosures("Check it out! #sponsored");
    expect(r.some((d) => d.kind === "sponsored-post")).toBe(true);
  });

  it("catches 'paid partnership'", () => {
    const r = detectDisclosures("This is a paid partnership with Acme.");
    expect(r.some((d) => d.kind === "paid-partnership")).toBe(true);
  });

  it("catches '#ad'", () => {
    const r = detectDisclosures("My favorite coffee beans! #ad");
    expect(r.some((d) => d.kind === "paid-partnership")).toBe(true);
  });

  it("catches 'in partnership with'", () => {
    const r = detectDisclosures("This review was produced in partnership with BrewCo.");
    expect(r.some((d) => d.kind === "in-partnership-with")).toBe(true);
  });

  it("empty text → []", () => {
    expect(detectDisclosures("")).toEqual([]);
  });

  it("dedupes on (kind, label)", () => {
    const r = detectDisclosures("affiliate links... affiliate links again...");
    expect(r.filter((d) => d.detail === "affiliate links")).toHaveLength(1);
  });

  it("surfaces snippet context around the match", () => {
    const text = "Welcome to the site. As an Amazon Associate we earn commission on purchases made.";
    const r = detectDisclosures(text);
    expect(r[0]!.snippet).toContain("Amazon Associate");
  });
});
