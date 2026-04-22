import { describe, expect, it } from "vitest";
import { assessSponsorship } from "./assess.js";

describe("assessSponsorship", () => {
  it("clear when neither affiliates nor disclosures", () => {
    const r = assessSponsorship({ affiliateIndicators: [], disclosures: [] });
    expect(r.verdict).toBe("clear");
    expect(r.rationale).toContain("No affiliate");
  });

  it("disclosed-partnership when BOTH present", () => {
    const r = assessSponsorship({
      affiliateIndicators: [{ kind: "amazon-tag", detail: "tag=x-20" }],
      disclosures: [{ kind: "ftc-affiliate", detail: "affiliate links", snippet: "x" }],
    });
    expect(r.verdict).toBe("disclosed-partnership");
    expect(r.rationale).toContain("FTC-compliant");
  });

  it("undisclosed-partnership when affiliate present + NO disclosure", () => {
    const r = assessSponsorship({
      affiliateIndicators: [{ kind: "share-a-sale", detail: "link" }],
      disclosures: [],
    });
    expect(r.verdict).toBe("undisclosed-partnership");
    expect(r.rationale).toContain("NO disclosure");
    expect(r.rationale).toContain("16 CFR");
  });

  it("disclosed when only disclosure, no affiliate markers", () => {
    const r = assessSponsorship({
      affiliateIndicators: [],
      disclosures: [{ kind: "sponsored-post", detail: "sponsored by", snippet: "x" }],
    });
    expect(r.verdict).toBe("disclosed-partnership");
    expect(r.rationale).toContain("transparent");
  });

  it("rationale surfaces the top affiliate indicator kind", () => {
    const r = assessSponsorship({
      affiliateIndicators: [
        { kind: "skimlinks", detail: "skim" },
        { kind: "amazon-tag", detail: "amazon tag" },
      ],
      disclosures: [],
    });
    expect(r.rationale).toContain("skimlinks");
  });
});
