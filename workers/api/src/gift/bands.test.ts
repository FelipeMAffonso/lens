import { describe, expect, it } from "vitest";
import { bandFor } from "./bands.js";

describe("bandFor", () => {
  it("< 50 → entry", () => {
    expect(bandFor(49).label).toBe("entry");
    expect(bandFor(10).label).toBe("entry");
  });
  it("50-149 → thoughtful", () => {
    expect(bandFor(50).label).toBe("thoughtful");
    expect(bandFor(149).label).toBe("thoughtful");
  });
  it("150-399 → premium", () => {
    expect(bandFor(150).label).toBe("premium");
    expect(bandFor(399).label).toBe("premium");
  });
  it("400-999 → luxury", () => {
    expect(bandFor(400).label).toBe("luxury");
    expect(bandFor(999).label).toBe("luxury");
  });
  it(">= 1000 → ultra", () => {
    expect(bandFor(1000).label).toBe("ultra");
    expect(bandFor(5000).label).toBe("ultra");
  });
  it("every band carries a hint", () => {
    for (const usd of [10, 75, 250, 700, 2000]) {
      expect(bandFor(usd).hint.length).toBeGreaterThan(4);
    }
  });
});
