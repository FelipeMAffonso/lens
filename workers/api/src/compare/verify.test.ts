import { describe, expect, it } from "vitest";
import { parseFramingJson } from "./verify.js";

describe("parseFramingJson", () => {
  it("parses a clean JSON response", () => {
    const json = JSON.stringify({
      axes: [
        { key: "price", label: "Price", aAssessment: "A is cheaper.", bAssessment: "B costs more.", leans: "A" },
        { key: "longevity", label: "Longevity", aAssessment: "A lasts 5y.", bAssessment: "B lasts 10y.", leans: "B" },
      ],
      verdict: { leaning: "A", summary: "A wins overall.", caveats: ["If you need longevity, B."] },
    });
    const out = parseFramingJson(json);
    expect(out.axes).toHaveLength(2);
    expect(out.axes[0]!.key).toBe("price");
    expect(out.verdict.leaning).toBe("A");
    expect(out.verdict.caveats).toHaveLength(1);
  });

  it("tolerates markdown fences around the JSON", () => {
    const fenced = "```json\n" +
      JSON.stringify({
        axes: [{ key: "a", label: "A", aAssessment: "x", bAssessment: "y", leans: "tied" }],
        verdict: { leaning: "tied", summary: "tied", caveats: [] },
      }) +
      "\n```";
    const out = parseFramingJson(fenced);
    expect(out.axes).toHaveLength(1);
  });

  it("tolerates surrounding prose", () => {
    const withProse = "Here's the analysis:\n\n" +
      JSON.stringify({
        axes: [{ key: "a", label: "A", aAssessment: "x", bAssessment: "y", leans: "A" }],
        verdict: { leaning: "A", summary: "s", caveats: [] },
      }) +
      "\n\nLet me know if you want more.";
    const out = parseFramingJson(withProse);
    expect(out.axes).toHaveLength(1);
  });

  it("silently drops malformed axis entries", () => {
    const json = JSON.stringify({
      axes: [
        { key: "ok", label: "OK", aAssessment: "a", bAssessment: "b", leans: "A" },
        { label: "Missing key" },
        "not-an-object",
        { key: "ok2", label: "OK2", aAssessment: "a2", bAssessment: "b2", leans: "B" },
      ],
      verdict: { leaning: "A", summary: "", caveats: [] },
    });
    const out = parseFramingJson(json);
    expect(out.axes).toHaveLength(2);
  });

  it("normalizes unknown leans values to tied", () => {
    const json = JSON.stringify({
      axes: [{ key: "k", label: "L", aAssessment: "a", bAssessment: "b", leans: "unknown" }],
      verdict: { leaning: "maybe?", summary: "", caveats: [] },
    });
    const out = parseFramingJson(json);
    expect(out.axes[0]!.leans).toBe("tied");
    expect(out.verdict.leaning).toBe("tied");
  });

  it("throws on no-JSON-present", () => {
    expect(() => parseFramingJson("This is just text with no object")).toThrow();
  });

  it("throws on malformed JSON", () => {
    expect(() => parseFramingJson("{not-valid-json")).toThrow();
  });

  it("filters non-string caveats", () => {
    const json = JSON.stringify({
      axes: [],
      verdict: { leaning: "A", summary: "s", caveats: ["ok", 123, { nope: true }, "also ok"] },
    });
    const out = parseFramingJson(json);
    expect(out.verdict.caveats).toEqual(["ok", "also ok"]);
  });
});
