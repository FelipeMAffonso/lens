import { describe, expect, it } from "vitest";
import { parseFdaOpen } from "./fda.js";

describe("parseFdaOpen", () => {
  it("parses an openFDA food enforcement row", () => {
    const items = parseFdaOpen(
      {
        results: [
          {
            recall_number: "F-0123-2026",
            recalling_firm: "Acme Organic Foods",
            product_description: "Organic Baby Spinach, 5 oz bag",
            reason_for_recall: "Possible Listeria contamination",
            recall_initiation_date: "20260401",
            voluntary_mandated: "Voluntary",
          },
        ],
      },
      "food",
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.recallId).toBe("fda-food:F-0123-2026");
    expect(items[0]!.brand).toBe("Acme Organic Foods");
    expect(items[0]!.hazard.toLowerCase()).toContain("listeria");
  });

  it("handles drug recalls", () => {
    const items = parseFdaOpen(
      {
        results: [
          {
            recall_number: "D-9876-2026",
            recalling_firm: "PharmaCo",
            product_description: "Lisinopril 20mg tablets",
            reason_for_recall: "Incorrect labeling",
            recall_initiation_date: "20260210",
          },
        ],
      },
      "drug",
    );
    expect(items[0]!.recallId.startsWith("fda-drug:")).toBe(true);
  });

  it("handles device recalls", () => {
    const items = parseFdaOpen(
      {
        results: [
          {
            recall_number: "Z-555-2026",
            recalling_firm: "MedDevice Corp",
            product_description: "CPAP Mask Model X",
            reason_for_recall: "Material degradation",
            recall_initiation_date: "2026-03-15",
          },
        ],
      },
      "device",
    );
    expect(items[0]!.recallId.startsWith("fda-device:")).toBe(true);
  });

  it("normalizes YYYYMMDD dates to ISO", () => {
    const items = parseFdaOpen(
      {
        results: [
          {
            recall_number: "F-1-2026",
            recalling_firm: "Firm",
            product_description: "Product",
            reason_for_recall: "Reason",
            recall_initiation_date: "20260401",
          },
        ],
      },
      "food",
    );
    expect(items[0]!.publishedAt).toBe("2026-04-01T00:00:00Z");
  });

  it("skips rows without a recall number", () => {
    const items = parseFdaOpen(
      {
        results: [{ recalling_firm: "Firm A" }, { recall_number: "F-2-2026", recalling_firm: "Firm B", product_description: "X", reason_for_recall: "Y", recall_initiation_date: "20260401" }],
      },
      "food",
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.brand).toBe("Firm B");
  });

  it("handles empty results", () => {
    expect(parseFdaOpen({}, "food")).toEqual([]);
    expect(parseFdaOpen({ results: [] }, "drug")).toEqual([]);
  });
});
