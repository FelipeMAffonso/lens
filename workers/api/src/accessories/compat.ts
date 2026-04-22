// S7-W39 — accessory compatibility gate.
// Pure function: given an accessory fixture and a product context (brand +
// product name), return {compatible, rule, detail?}. The rule string is
// what we surface in the UI to explain the verdict.

import { FAMILY_54MM, FAMILY_58MM } from "./fixtures.js";
import type { AccessoryFixture, CompatResult, ProductContext } from "./types.js";

function tokens(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

function normalizeBrand(b: string | null | undefined): string {
  return (b ?? "").trim().toLowerCase();
}

/** Does the purchase fall in the 54mm / 58mm family? */
function portafilterFamilyOf(ctx: ProductContext): "54mm" | "58mm" | null {
  const brand = normalizeBrand(ctx.brand);
  if (FAMILY_54MM.has(brand)) return "54mm";
  if (FAMILY_58MM.has(brand)) return "58mm";
  return null;
}

export function isCompatible(acc: AccessoryFixture, ctx: ProductContext): CompatResult {
  // 1. Portafilter-size gate (strictest; applies only to espresso tamper + mat).
  if (acc.compatibleWith.portafilterSize) {
    const family = portafilterFamilyOf(ctx);
    if (family === null) {
      return {
        compatible: true,
        rule: "fallback-unknown-portafilter",
        detail: `Accessory targets the ${acc.compatibleWith.portafilterSize} portafilter family; purchase brand is unknown, so surfacing with a caveat.`,
      };
    }
    if (family !== acc.compatibleWith.portafilterSize) {
      return {
        compatible: false,
        rule: `portafilter-size-mismatch`,
        detail: `Accessory targets ${acc.compatibleWith.portafilterSize}; purchase is in the ${family} family.`,
      };
    }
    return {
      compatible: true,
      rule: `portafilter-${acc.compatibleWith.portafilterSize}`,
      detail: `Purchase is in the ${family} portafilter family.`,
    };
  }

  // 2. Brand gate.
  if (acc.compatibleWith.brands && acc.compatibleWith.brands.length > 0) {
    const brand = normalizeBrand(ctx.brand);
    if (!brand) {
      return {
        compatible: true,
        rule: "fallback-unknown-brand",
        detail: `Accessory targets brands [${acc.compatibleWith.brands.join(", ")}]; purchase brand is unknown, so surfacing with a caveat.`,
      };
    }
    const hit = acc.compatibleWith.brands.some((b) => b.toLowerCase() === brand);
    if (!hit) {
      return {
        compatible: false,
        rule: "brand-mismatch",
        detail: `Accessory targets brands [${acc.compatibleWith.brands.join(", ")}]; purchase is ${ctx.brand ?? "(unknown)"}.`,
      };
    }
    return { compatible: true, rule: "brand-match", detail: `Brand ${ctx.brand} is in the compatible list.` };
  }

  // 3. Product-token gate.
  if (acc.compatibleWith.productTokens && acc.compatibleWith.productTokens.length > 0) {
    const productTokens = tokens(ctx.productName);
    const hits = acc.compatibleWith.productTokens.filter((t) =>
      [...productTokens].some((p) => p.includes(t) || t.includes(p)),
    );
    if (hits.length === 0) {
      return {
        compatible: false,
        rule: "product-token-mismatch",
        detail: `Accessory targets products containing any of [${acc.compatibleWith.productTokens.join(", ")}]; purchase name has no overlap.`,
      };
    }
    return {
      compatible: true,
      rule: "product-token-match",
      detail: `Matched tokens: ${hits.join(", ")}.`,
    };
  }

  // 4. No gates → universally compatible for that category.
  return { compatible: true, rule: "universal-accessory", detail: "No brand/model constraint." };
}
