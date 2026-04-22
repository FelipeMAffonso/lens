import { describe, expect, it } from "vitest";
import { analyzeBimodal } from "./bimodal.js";

describe("analyzeBimodal", () => {
  it("flags 20/60 bimodal shape", () => {
    const r = analyzeBimodal({ star1: 20, star2: 2, star3: 3, star4: 5, star5: 70 });
    expect(r.total).toBe(100);
    expect(r.p1).toBe(0.2);
    expect(r.p5).toBe(0.7);
    expect(r.bimodal).toBe(true);
  });

  it("natural shape (few 1-star, many 5-star) is NOT bimodal", () => {
    const r = analyzeBimodal({ star1: 2, star2: 3, star3: 5, star4: 15, star5: 75 });
    expect(r.bimodal).toBe(false);
    expect(r.p1).toBeLessThan(0.1);
  });

  it("all five-star → p5=1, not bimodal (p1 too low)", () => {
    const r = analyzeBimodal({ star1: 0, star2: 0, star3: 0, star4: 0, star5: 100 });
    expect(r.p1).toBe(0);
    expect(r.p5).toBe(1);
    expect(r.bimodal).toBe(false);
  });

  it("heavy 1-star + heavy 5-star + sparse middle", () => {
    const r = analyzeBimodal({ star1: 30, star2: 5, star3: 0, star4: 5, star5: 60 });
    expect(r.bimodal).toBe(true);
  });

  it("zero total → zeros + not bimodal", () => {
    const r = analyzeBimodal({ star1: 0, star2: 0, star3: 0, star4: 0, star5: 0 });
    expect(r.total).toBe(0);
    expect(r.bimodal).toBe(false);
  });

  it("p1/p5 rounded to 4 decimals", () => {
    const r = analyzeBimodal({ star1: 1, star2: 0, star3: 0, star4: 0, star5: 2 });
    expect(r.p1).toBe(0.3333);
    expect(r.p5).toBe(0.6667);
  });
});
