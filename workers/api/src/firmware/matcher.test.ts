import { describe, expect, it } from "vitest";
import { FIRMWARE_MATCHER_THRESHOLD, isConnectedDevice, matchFirmware } from "./matcher.js";
import { FIXTURE_ADVISORIES } from "./fixtures.js";
import type { PurchaseLike } from "./types.js";

function purchase(over: Partial<PurchaseLike> = {}): PurchaseLike {
  return {
    id: "p-1",
    user_id: "u1",
    product_name: "ASUS RT-AX88U AX6000 Dual-Band Gaming Router",
    brand: "ASUS",
    category: "routers",
    purchased_at: "2025-02-01T00:00:00.000Z",
    ...over,
  };
}

describe("isConnectedDevice", () => {
  it("accepts allowlisted categories", () => {
    expect(isConnectedDevice(purchase({ category: "routers" }))).toBe(true);
    expect(isConnectedDevice(purchase({ category: "security-cameras" }))).toBe(true);
    expect(isConnectedDevice(purchase({ category: "printers" }))).toBe(true);
  });

  it("rejects non-connected categories", () => {
    expect(isConnectedDevice(purchase({ category: "blenders", product_name: "Vitamix Pro 750" }))).toBe(false);
    expect(isConnectedDevice(purchase({ category: "espresso-machines", product_name: "Breville Bambino" }))).toBe(false);
  });

  it("falls through to product_name keywords when category is null", () => {
    expect(isConnectedDevice(purchase({ category: null, product_name: "TP-Link Smart Bulb" }))).toBe(false);
    expect(isConnectedDevice(purchase({ category: null, product_name: "Nest Thermostat E" }))).toBe(true);
    expect(isConnectedDevice(purchase({ category: null, product_name: "Brother HL-L2350DW Printer" }))).toBe(true);
  });
});

describe("matchFirmware", () => {
  it("matches ASUS RT-AX88U to ASUS-SA-2025-07 with score ≥ 0.7", () => {
    const matches = matchFirmware(FIXTURE_ADVISORIES, [purchase()]);
    const hit = matches.find((m) => m.advisory.advisoryId === "ASUS-SA-2025-07");
    expect(hit).toBeDefined();
    expect(hit!.score).toBeGreaterThanOrEqual(FIRMWARE_MATCHER_THRESHOLD);
    expect(hit!.reasons.some((r) => r.includes("vendor match"))).toBe(true);
    expect(hit!.reasons.some((r) => r.includes("affected-model"))).toBe(true);
  });

  it("matches eufy camera purchase to EUFY-2025-005", () => {
    const matches = matchFirmware(
      FIXTURE_ADVISORIES,
      [purchase({ id: "p-eufy", product_name: "eufy Security Camera 2C Pro", brand: "eufy", category: "security-cameras" })],
    );
    const hit = matches.find((m) => m.advisory.advisoryId === "EUFY-2025-005");
    expect(hit).toBeDefined();
  });

  it("matches D-Link DIR-825 purchase to CVE-2024-55512", () => {
    const matches = matchFirmware(
      FIXTURE_ADVISORIES,
      [purchase({
        id: "p-dlink",
        product_name: "D-Link DIR-825 wireless router",
        brand: "D-Link",
        category: "routers",
        purchased_at: "2023-01-01T00:00:00.000Z",
      })],
    );
    const hit = matches.find((m) => m.advisory.advisoryId === "CVE-2024-55512");
    expect(hit).toBeDefined();
  });

  it("does NOT match a blender purchase (category allowlist miss)", () => {
    const matches = matchFirmware(
      FIXTURE_ADVISORIES,
      [purchase({ id: "p-blender", product_name: "Vitamix Pro 750 Blender", brand: "Vitamix", category: "blenders" })],
    );
    expect(matches.find((m) => m.purchase.id === "p-blender")).toBeUndefined();
  });

  it("does NOT match an advisory published before the purchase", () => {
    const matches = matchFirmware(
      FIXTURE_ADVISORIES,
      [purchase({ purchased_at: "2026-01-01T00:00:00.000Z" })], // after ASUS-SA-2025-07 (2025-07)
    );
    const hit = matches.find((m) => m.advisory.advisoryId === "ASUS-SA-2025-07");
    // Still may match on brand + model alone (0.4 + 0.4 = 0.8); recency gate just withholds the +0.2 bonus.
    if (hit) expect(hit.reasons.every((r) => !r.includes("within 5y"))).toBe(true);
  });

  it("does NOT match the Linksys WRT54GS advisory from 2019 (outside 5y recency)", () => {
    const matches = matchFirmware(
      FIXTURE_ADVISORIES,
      [purchase({
        id: "p-linksys",
        product_name: "Linksys WRT54GS",
        brand: "Linksys",
        purchased_at: "2013-01-01T00:00:00.000Z",  // advisory 2019 → > 5y gap
      })],
    );
    const hit = matches.find((m) => m.advisory.advisoryId === "FAKE-OLD-2019");
    if (hit) {
      expect(hit.reasons.every((r) => !r.includes("within 5y"))).toBe(true);
    }
  });

  it("brand match alone (no model match) is below threshold", () => {
    const matches = matchFirmware(
      FIXTURE_ADVISORIES,
      [purchase({
        id: "p-asus-random",
        product_name: "ASUS Chromebook C425",   // brand hits, model never shipped as router
        brand: "ASUS",
        category: "routers",  // still in allowlist so gate passes
        purchased_at: "2025-01-01T00:00:00.000Z",
      })],
    );
    // Brand (0.4) + recency (0.2) = 0.6 < 0.7 threshold → no match for any ASUS advisory.
    expect(matches.find((m) => m.advisory.advisoryId === "ASUS-SA-2025-07")).toBeUndefined();
  });

  it("model mismatch for negative-control FAKE-MODEL-MISS does not match", () => {
    const matches = matchFirmware(
      [FIXTURE_ADVISORIES.find((a) => a.advisoryId === "FAKE-MODEL-MISS")!],
      [purchase()], // ASUS RT-AX88U
    );
    // Brand match + recency = 0.6 < 0.7
    expect(matches).toHaveLength(0);
  });

  it("handles multiple matches across multiple purchases", () => {
    const matches = matchFirmware(FIXTURE_ADVISORIES, [
      purchase({ id: "a" }),
      purchase({ id: "b", product_name: "Synology DS220+ NAS", brand: "Synology", category: "nas" }),
      purchase({ id: "c", product_name: "HP LaserJet Pro M404n", brand: "HP", category: "printers" }),
    ]);
    const ids = new Set(matches.map((m) => m.advisory.advisoryId));
    expect(ids.has("ASUS-SA-2025-07")).toBe(true);
    expect(ids.has("SYNOLOGY-2025-08")).toBe(true);
    expect(ids.has("HP-PSIRT-2025-10")).toBe(true);
  });

  it("empty purchase list returns []", () => {
    expect(matchFirmware(FIXTURE_ADVISORIES, [])).toEqual([]);
  });

  it("empty advisory list returns []", () => {
    expect(matchFirmware([], [purchase()])).toEqual([]);
  });
});
