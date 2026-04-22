import { describe, expect, it } from "vitest";
import { renderDraft, substitute } from "./render.js";

describe("substitute", () => {
  it("substitutes simple tokens", () => {
    const out = substitute("Dear {seller_name},", { seller_name: "Best Buy" });
    expect(out).toBe("Dear Best Buy,");
  });

  it("replaces a missing token with a visible TODO sentinel", () => {
    const out = substitute("Sincerely,\n{user_name}", { user_name: undefined });
    expect(out).toBe("Sincerely,\n[TODO: user_name]");
  });

  it("treats empty-string tokens as missing", () => {
    const out = substitute("{user_contact}", { user_contact: "" });
    expect(out).toBe("[TODO: user_contact]");
  });

  it("treats null tokens as missing", () => {
    const out = substitute("{order_id}", { order_id: null });
    expect(out).toBe("[TODO: order_id]");
  });

  it("resolves a pipe-union placeholder via _verb", () => {
    const out = substitute("request {return | warranty service | replacement} for", {
      _verb: "warranty service",
    });
    expect(out).toBe("request warranty service for");
  });

  it("leaves the pipe-union in place when _verb is absent", () => {
    const out = substitute("request {return | warranty service | replacement} for", {});
    expect(out).toBe("request {return | warranty service | replacement} for");
  });

  it("substitutes many tokens in a paragraph", () => {
    const tpl =
      "Hi {seller_name}, order {order_id} purchased {purchase_date} for {product_name} has {defect_description}.";
    const out = substitute(tpl, {
      seller_name: "Target",
      order_id: "T-123",
      purchase_date: "2026-04-01",
      product_name: "Keurig K-Mini",
      defect_description: "does not brew hot enough",
    });
    expect(out).toBe(
      "Hi Target, order T-123 purchased 2026-04-01 for Keurig K-Mini has does not brew hot enough.",
    );
  });
});

describe("renderDraft", () => {
  it("renders both subject and body from templates + tokens", () => {
    const rendered = renderDraft({
      subjectTemplate: "Warranty claim — {product_name}",
      bodyTemplate: "Dear {seller_name},\nRe: {product_name} ({order_id}).\n\n{user_name}",
      tokens: {
        product_name: "MacBook Air",
        seller_name: "Apple",
        order_id: "A-999",
        user_name: "Jane Doe",
      },
    });
    expect(rendered.subject).toBe("Warranty claim — MacBook Air");
    expect(rendered.body).toBe("Dear Apple,\nRe: MacBook Air (A-999).\n\nJane Doe");
  });

  it("surfaces TODO sentinels when user details are omitted", () => {
    const rendered = renderDraft({
      subjectTemplate: "Warranty claim — {product_name}",
      bodyTemplate: "{user_name}\n{user_contact}",
      tokens: { product_name: "MacBook Air" },
    });
    expect(rendered.subject).toBe("Warranty claim — MacBook Air");
    expect(rendered.body).toBe("[TODO: user_name]\n[TODO: user_contact]");
  });
});
