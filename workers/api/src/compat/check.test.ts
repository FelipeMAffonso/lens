import { describe, expect, it } from "vitest";
import { checkCompat } from "./check.js";

describe("checkCompat orchestrator", () => {
  it("acceptance: M.2 NVMe SSD + 2015 MacBook Pro → incompatible", () => {
    const r = checkCompat({
      target: { category: "ssd", name: "Samsung 990 Pro M.2 2280 NVMe" },
      equipment: [{ category: "laptops", name: "2015 MacBook Pro 13-inch Retina" }],
    });
    expect(r.overall).toBe("incompatible");
    expect(r.rules.some((x) => x.id === "mbp-proprietary-blade")).toBe(true);
    expect(r.rationale).toContain("blocker");
  });

  it("matching NVMe SSD + modern XPS → compatible with a supporting rule", () => {
    const r = checkCompat({
      target: { category: "ssd", name: "WD SN850X M.2 2280 NVMe" },
      equipment: [{ category: "laptops", name: "Dell XPS 15" }],
    });
    expect(r.overall).toBe("compatible");
    expect(r.rules.some((x) => x.id === "storage-format-match")).toBe(true);
  });

  it("HDMI 2.0 cable + HDMI 2.1 TV 120Hz → partial", () => {
    const r = checkCompat({
      target: { category: "hdmi-cable", specs: { hdmi: "2.0" } },
      equipment: [{ category: "tvs", name: "LG C2" }],
    });
    expect(r.overall).toBe("partial");
  });

  it("unknown pair → no-rule-matched with helpful rationale", () => {
    const r = checkCompat({
      target: { category: "obscure", name: "avocado slicer" },
      equipment: [{ category: "kitchen" }],
    });
    expect(r.overall).toBe("no-rule-matched");
    expect(r.rationale.toLowerCase()).toContain("no compatibility rule");
  });

  it("emits missingSpecs hints when underpowered", () => {
    const r = checkCompat({
      target: { category: "ssd", name: "Some SSD" },
      equipment: [{ category: "laptops", name: "Some Laptop" }],
    });
    expect(r.overall).toBe("no-rule-matched");
    expect(r.missingSpecs.length).toBeGreaterThan(0);
  });

  it("composite verdict: multi-equipment with mixed outcomes → partial", () => {
    const r = checkCompat({
      target: { category: "charger", specs: { watts: 100 } },
      equipment: [
        { category: "laptops", specs: { chargingW: 60 } }, // pass (100 >= 60)
        { category: "laptops", specs: { chargingW: 140 } }, // fail blocker
      ],
    });
    expect(r.overall).toBe("incompatible"); // any blocker dominates
    expect(r.rules.filter((x) => x.verdict === "pass")).toHaveLength(1);
    expect(r.rules.filter((x) => x.verdict === "fail")).toHaveLength(1);
  });

  it("emits rules empty + overall=no-rule-matched on categorical mismatch", () => {
    const r = checkCompat({
      target: { category: "lens", specs: { mount: "ef" } },
      equipment: [{ category: "phones" }],
    });
    expect(r.overall).toBe("no-rule-matched");
  });
});
