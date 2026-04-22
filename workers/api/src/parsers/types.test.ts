import { describe, expect, it } from "vitest";
import { mergeParse, stampSources, type ProductParse } from "./types.js";

describe("mergeParse", () => {
  it("A scalar fields win over B", () => {
    const a: ProductParse = { name: "A", price: 1 };
    const b: ProductParse = { name: "B", brand: "B-brand" };
    const r = mergeParse(a, b);
    expect(r.name).toBe("A");
    expect(r.price).toBe(1);
    expect(r.brand).toBe("B-brand"); // falls through from B
  });

  it("undefined A fields do not overwrite B", () => {
    const a: ProductParse = { name: "A" };
    const b: ProductParse = { name: "B", brand: "B-brand" };
    expect(mergeParse(a, b).brand).toBe("B-brand");
  });

  it("array fields are replaced wholesale when A non-empty", () => {
    const a: ProductParse = { images: ["a1", "a2"] };
    const b: ProductParse = { images: ["b1"] };
    expect(mergeParse(a, b).images).toEqual(["a1", "a2"]);
  });

  it("sources maps merge with A winning per-key", () => {
    const a: ProductParse = { name: "A", sources: { name: "host" } };
    const b: ProductParse = { name: "B", price: 5, sources: { name: "json-ld", price: "json-ld" } };
    const r = mergeParse(a, b);
    expect(r.sources?.name).toBe("host");
    expect(r.sources?.price).toBe("json-ld");
  });
});

describe("stampSources", () => {
  it("tags every present scalar with the same source", () => {
    const stamped = stampSources({ name: "x", price: 1 }, "host");
    expect(stamped.sources?.name).toBe("host");
    expect(stamped.sources?.price).toBe("host");
    expect(stamped.sources?.brand).toBeUndefined();
  });

  it("preserves existing source tags when present", () => {
    const pre: ProductParse = { name: "x", sources: { name: "json-ld" } };
    const r = stampSources(pre, "host");
    expect(r.sources?.name).toBe("host"); // stamp overrides
  });
});
