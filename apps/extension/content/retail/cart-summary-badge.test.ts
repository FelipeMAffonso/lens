import { describe, expect, it } from "vitest";
import { cartTotalAnchor, isCartOrCheckout } from "./cart-summary-badge.js";

describe("isCartOrCheckout", () => {
  it("detects standard cart + checkout paths", () => {
    expect(isCartOrCheckout(new URL("https://www.amazon.com/gp/cart/view.html"))).toBe(true);
    expect(isCartOrCheckout(new URL("https://www.amazon.com/gp/buy/spc/handlers/display.html"))).toBe(false);
    expect(isCartOrCheckout(new URL("https://www.amazon.com/checkout"))).toBe(true);
    expect(isCartOrCheckout(new URL("https://www.walmart.com/cart"))).toBe(true);
    expect(isCartOrCheckout(new URL("https://www.target.com/co-cart"))).toBe(true);
    expect(isCartOrCheckout(new URL("https://www.bestbuy.com/site/cart"))).toBe(true);
    expect(isCartOrCheckout(new URL("https://www.marriott.com/booking/confirm"))).toBe(true);
    expect(isCartOrCheckout(new URL("https://example.com/payment"))).toBe(true);
  });

  it("rejects product + category URLs", () => {
    expect(isCartOrCheckout(new URL("https://www.amazon.com/dp/B0G1MRLXMV"))).toBe(false);
    expect(isCartOrCheckout(new URL("https://www.walmart.com/ip/foo/123"))).toBe(false);
    expect(isCartOrCheckout(new URL("https://www.target.com/c/kitchen"))).toBe(false);
  });
});

describe("cartTotalAnchor (unit — no DOM)", () => {
  it("returns null when the selector matches nothing", () => {
    // jsdom default empty body
    document.body.innerHTML = "";
    for (const h of ["amazon", "bestbuy", "walmart", "target", "homedepot", "costco"] as const) {
      expect(cartTotalAnchor(h)).toBeNull();
    }
  });

  it("finds Amazon subtotal anchor by id", () => {
    document.body.innerHTML = '<span id="sc-subtotal-amount-buybox">$149.99</span>';
    expect(cartTotalAnchor("amazon")).not.toBeNull();
  });

  it("finds Best Buy anchor by testid", () => {
    document.body.innerHTML = '<span data-testid="order-summary-subtotal-value">$99</span>';
    expect(cartTotalAnchor("bestbuy")).not.toBeNull();
  });

  it("finds Walmart anchor by testid", () => {
    document.body.innerHTML = '<span data-testid="order-summary-sub-total">$50</span>';
    expect(cartTotalAnchor("walmart")).not.toBeNull();
  });

  it("finds Target anchor by data-test", () => {
    document.body.innerHTML = '<span data-test="order-summary-subtotal">$75</span>';
    expect(cartTotalAnchor("target")).not.toBeNull();
  });

  it("finds Home Depot anchor by class", () => {
    document.body.innerHTML = '<div class="price-detailed__total">$1,299</div>';
    expect(cartTotalAnchor("homedepot")).not.toBeNull();
  });

  it("finds Costco anchor by automation id", () => {
    document.body.innerHTML = '<span data-automation-id="orderSummarySubtotal">$199</span>';
    expect(cartTotalAnchor("costco")).not.toBeNull();
  });
});
