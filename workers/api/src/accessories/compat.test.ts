import { describe, expect, it } from "vitest";
import { isCompatible } from "./compat.js";
import { ACCESSORY_CATALOG } from "./fixtures.js";
import type { AccessoryFixture } from "./types.js";

const ESPRESSO = ACCESSORY_CATALOG["espresso-machines"]!;
const LAPTOP = ACCESSORY_CATALOG.laptops!;

function getAcc(cat: AccessoryFixture[], name: string): AccessoryFixture {
  const a = cat.find((x) => x.name === name);
  if (!a) throw new Error(`fixture missing: ${name}`);
  return a;
}

describe("isCompatible", () => {
  it("portafilter 54mm: Breville Bambino passes", () => {
    const tamper = getAcc(ESPRESSO, "54mm Calibrated Tamper");
    const result = isCompatible(tamper, {
      category: "espresso-machines",
      brand: "Breville",
      productName: "Breville Bambino Plus",
    });
    expect(result.compatible).toBe(true);
    expect(result.rule).toBe("portafilter-54mm");
  });

  it("portafilter 54mm: Rancilio (58mm family) fails", () => {
    const tamper = getAcc(ESPRESSO, "54mm Calibrated Tamper");
    const result = isCompatible(tamper, {
      category: "espresso-machines",
      brand: "Rancilio",
      productName: "Rancilio Silvia",
    });
    expect(result.compatible).toBe(false);
    expect(result.rule).toBe("portafilter-size-mismatch");
  });

  it("portafilter unknown-brand falls through with caveat", () => {
    const tamper = getAcc(ESPRESSO, "54mm Calibrated Tamper");
    const result = isCompatible(tamper, {
      category: "espresso-machines",
      brand: "UnknownBrand",
      productName: "Some Machine",
    });
    expect(result.compatible).toBe(true);
    expect(result.rule).toBe("fallback-unknown-portafilter");
  });

  it("brand-match: Breville water filter with Breville purchase passes", () => {
    const filter = getAcc(ESPRESSO, "Breville Claro Swiss Water Filter (2-pack)");
    const result = isCompatible(filter, {
      category: "espresso-machines",
      brand: "Breville",
      productName: "Breville Barista Express",
    });
    expect(result.compatible).toBe(true);
    expect(result.rule).toBe("brand-match");
  });

  it("brand-mismatch: Breville water filter with De'Longhi purchase fails", () => {
    const filter = getAcc(ESPRESSO, "Breville Claro Swiss Water Filter (2-pack)");
    const result = isCompatible(filter, {
      category: "espresso-machines",
      brand: "De'Longhi",
      productName: "De'Longhi Stilosa",
    });
    expect(result.compatible).toBe(false);
    expect(result.rule).toBe("brand-mismatch");
  });

  it("fallback-unknown-brand: Breville filter with no brand surfaces with caveat", () => {
    const filter = getAcc(ESPRESSO, "Breville Claro Swiss Water Filter (2-pack)");
    const result = isCompatible(filter, { category: "espresso-machines" });
    expect(result.compatible).toBe(true);
    expect(result.rule).toBe("fallback-unknown-brand");
  });

  it("product-token: USB-C hub with macbook purchase passes", () => {
    const hub = getAcc(LAPTOP, "7-port USB-C Hub");
    const result = isCompatible(hub, {
      category: "laptops",
      brand: "Apple",
      productName: "MacBook Air M3",
    });
    expect(result.compatible).toBe(true);
    expect(result.rule).toBe("product-token-match");
  });

  it("product-token miss: USB-C hub with non-matching product", () => {
    const hub = getAcc(LAPTOP, "7-port USB-C Hub");
    const result = isCompatible(hub, {
      category: "laptops",
      brand: "Dell",
      productName: "Inspiron 3000",
    });
    expect(result.compatible).toBe(false);
    expect(result.rule).toBe("product-token-mismatch");
  });

  it("universal accessory (no gates): stand passes for every laptop", () => {
    const stand = getAcc(LAPTOP, "Adjustable Laptop Stand");
    const result = isCompatible(stand, {
      category: "laptops",
      brand: "Any",
      productName: "Any Laptop",
    });
    expect(result.compatible).toBe(true);
    expect(result.rule).toBe("universal-accessory");
  });

  it("case-insensitive brand matching", () => {
    const filter = getAcc(ESPRESSO, "Breville Claro Swiss Water Filter (2-pack)");
    const result = isCompatible(filter, {
      category: "espresso-machines",
      brand: "BREVILLE",
      productName: "Some Breville Machine",
    });
    expect(result.compatible).toBe(true);
  });
});
