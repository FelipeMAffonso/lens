import { describe, expect, it } from "vitest";
import { enrichFromName } from "./profiles.js";

describe("enrichFromName", () => {
  it("pulls 2015 MacBook Pro 13 Retina specs from the name", () => {
    const r = enrichFromName({ category: "laptops", name: "2015 MacBook Pro 13-inch Retina" });
    expect(r.specs?.storageFormat).toBe("apple-proprietary-2015");
    expect(r.specs?.year).toBe(2015);
  });

  it("enriches an iPhone 15 Pro Max with USB-C + caseFamily", () => {
    const r = enrichFromName({ category: "phones", name: "iPhone 15 Pro Max 256GB" });
    expect(r.specs?.usbC).toBe(true);
    expect(r.specs?.caseFamily).toBe("iphone-15-pro-max");
  });

  it("caller specs win on conflict", () => {
    const r = enrichFromName({
      category: "phones",
      name: "iPhone 15 Pro Max",
      specs: { bluetooth: "6.0" }, // stubbed override
    });
    expect(r.specs?.bluetooth).toBe("6.0");
    // Other profile fields still present
    expect(r.specs?.usbC).toBe(true);
  });

  it("infers category override when caller leaves it unknown", () => {
    const r = enrichFromName({ category: "unknown", name: "2015 MacBook Pro 13 Retina" });
    expect(r.category).toBe("laptops");
  });

  it("leaves an unknown name unchanged", () => {
    const r = enrichFromName({ category: "laptops", name: "some obscure device" });
    // No profile matched → input passes through; specs stays undefined.
    expect(r.specs).toBeUndefined();
  });

  it("no-op when name absent", () => {
    const r = enrichFromName({ category: "ssd" });
    expect(r.specs).toBeUndefined();
  });
});
