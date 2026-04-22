import { describe, expect, it } from "vitest";
import { parseNhtsaJson } from "./nhtsa.js";

describe("parseNhtsaJson", () => {
  it("normalizes a single NHTSA campaign", () => {
    const items = parseNhtsaJson({
      results: [
        {
          Manufacturer: "Tesla, Inc.",
          Make: "Tesla",
          Model: "Model Y",
          ModelYear: "2023",
          NHTSACampaignNumber: "26V100000",
          Component: "Rear Camera Harness",
          Summary: "The rear camera harness may chafe against...",
          Consequence: "Loss of rearview camera display increases collision risk.",
          Remedy: "Dealers will replace the harness free of charge.",
          ReportReceivedDate: "04/15/2026",
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.recallId).toBe("nhtsa:26V100000");
    expect(items[0]!.brand).toBe("Tesla");
    expect(items[0]!.productNames[0]).toBe("2023 Tesla Model Y");
    expect(items[0]!.hazard).toContain("collision");
  });

  it("skips rows without a campaign number", () => {
    const items = parseNhtsaJson({
      results: [{ Make: "Ford" }, { NHTSACampaignNumber: "26V999999", Make: "Toyota", Model: "Camry", ModelYear: "2025" }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.brand).toBe("Toyota");
  });

  it("handles empty / missing results safely", () => {
    expect(parseNhtsaJson({})).toEqual([]);
    expect(parseNhtsaJson({ results: [] })).toEqual([]);
  });

  it("falls back to Manufacturer if Make is absent", () => {
    const items = parseNhtsaJson({
      results: [
        {
          Manufacturer: "Graco Children's Products",
          NHTSACampaignNumber: "26E050000",
          Component: "4Ever DLX Car Seat",
          Summary: "Harness chest clip may crack.",
          Consequence: "Reduced restraint effectiveness.",
          ModelYear: "2025",
          Model: "4Ever DLX",
          ReportReceivedDate: "2026-04-10",
        },
      ],
    });
    expect(items[0]!.brand).toBe("Graco Children's Products");
  });

  it("generates a valid sourceUrl with encoded campaign id", () => {
    const items = parseNhtsaJson({
      results: [{ NHTSACampaignNumber: "26V 100/000", Make: "Tesla", Model: "Y", ModelYear: "2023" }],
    });
    expect(items[0]!.sourceUrl).toContain("26V%20100%2F000");
  });

  it("produces ISO publishedAt", () => {
    const items = parseNhtsaJson({
      results: [
        {
          NHTSACampaignNumber: "26V000001",
          Make: "X",
          Model: "Y",
          ModelYear: "2025",
          ReportReceivedDate: "2026-04-01",
        },
      ],
    });
    expect(items[0]!.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
