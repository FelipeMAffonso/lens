import { describe, expect, it } from "vitest";
import { TOOLS } from "./tools.js";

describe("tool registry", () => {
  it("ships 7 lens.* tools", () => {
    expect(TOOLS).toHaveLength(7);
    const names = new Set(TOOLS.map((t) => t.name));
    expect(names).toEqual(
      new Set([
        "lens.audit",
        "lens.spec_optimal",
        "lens.dark_pattern_scan",
        "lens.regulation_lookup",
        "lens.pack_get",
        "lens.pack_list",
        "lens.intervention_draft",
      ]),
    );
  });

  it("every tool has a description + input schema", () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.properties).toBeDefined();
    }
  });

  it("required arrays only reference existing properties", () => {
    for (const t of TOOLS) {
      for (const r of t.inputSchema.required ?? []) {
        expect(Object.keys(t.inputSchema.properties)).toContain(r);
      }
    }
  });

  it("lens.audit requires kind", () => {
    const t = TOOLS.find((x) => x.name === "lens.audit")!;
    expect(t.inputSchema.required).toContain("kind");
  });

  it("lens.regulation_lookup requires slug", () => {
    const t = TOOLS.find((x) => x.name === "lens.regulation_lookup")!;
    expect(t.inputSchema.required).toEqual(["slug"]);
  });

  it("lens.intervention_draft requires packSlug + context", () => {
    const t = TOOLS.find((x) => x.name === "lens.intervention_draft")!;
    expect(t.inputSchema.required).toEqual(expect.arrayContaining(["packSlug", "context"]));
  });
});
