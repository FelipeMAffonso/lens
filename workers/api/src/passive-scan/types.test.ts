// S4-W22 — Zod boundary tests.

import { describe, expect, it } from "vitest";
import { PassiveScanRequestSchema, HitSchema } from "./types.js";

describe("HitSchema", () => {
  it("accepts a valid hit", () => {
    const r = HitSchema.safeParse({
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      severity: "deceptive",
      excerpt: "Destination Amenity Fee $49/night",
    });
    expect(r.success).toBe(true);
  });
  it("rejects a malformed packSlug", () => {
    const r = HitSchema.safeParse({
      packSlug: "category/laptops",
      brignullId: "hidden-costs",
      severity: "deceptive",
      excerpt: "x",
    });
    expect(r.success).toBe(false);
  });
  it("rejects an unknown severity", () => {
    const r = HitSchema.safeParse({
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      severity: "mild", // invalid
      excerpt: "x",
    });
    expect(r.success).toBe(false);
  });
  it("rejects an excerpt that is too long", () => {
    const r = HitSchema.safeParse({
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      severity: "deceptive",
      excerpt: "a".repeat(401),
    });
    expect(r.success).toBe(false);
  });
});

describe("PassiveScanRequestSchema", () => {
  const valid = {
    host: "marriott.com",
    pageType: "checkout",
    url: "https://www.marriott.com/booking/confirm",
    hits: [
      {
        packSlug: "dark-pattern/hidden-costs",
        brignullId: "hidden-costs",
        severity: "deceptive",
        excerpt: "Destination Amenity Fee $49/night",
      },
    ],
  } as const;

  it("accepts a canonical request", () => {
    const r = PassiveScanRequestSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.jurisdiction).toBe("us-federal"); // default applied
    }
  });

  it("rejects non-DNS host", () => {
    const r = PassiveScanRequestSchema.safeParse({ ...valid, host: "https://marriott.com" });
    expect(r.success).toBe(false);
  });

  it("rejects empty hits array", () => {
    const r = PassiveScanRequestSchema.safeParse({ ...valid, hits: [] });
    expect(r.success).toBe(false);
  });

  it("rejects > 20 hits", () => {
    const hits = Array.from({ length: 21 }, (_, i) => ({
      packSlug: `dark-pattern/pattern-${i}`.slice(0, 100),
      brignullId: `p${i}`,
      severity: "deceptive" as const,
      excerpt: "x",
    }));
    const r = PassiveScanRequestSchema.safeParse({ ...valid, hits });
    expect(r.success).toBe(false);
  });

  it("rejects unknown pageType", () => {
    const r = PassiveScanRequestSchema.safeParse({ ...valid, pageType: "foo" });
    expect(r.success).toBe(false);
  });

  it("accepts custom jurisdiction", () => {
    const r = PassiveScanRequestSchema.safeParse({ ...valid, jurisdiction: "eu" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.jurisdiction).toBe("eu");
  });
});
