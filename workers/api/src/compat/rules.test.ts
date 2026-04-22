import { describe, expect, it } from "vitest";
import { runAllRules } from "./rules.js";
import type { CompatItem } from "./types.js";

function it_fires(
  name: string,
  target: CompatItem,
  equipment: CompatItem[],
  expectVerdict: "fail" | "pass" | "warn",
  expectId: string,
): void {
  it(name, () => {
    const rs = runAllRules(target, equipment);
    const hit = rs.find((r) => r.id === expectId);
    expect(hit, `expected rule ${expectId} to fire; got ${JSON.stringify(rs.map((r) => r.id))}`).toBeDefined();
    expect(hit!.verdict).toBe(expectVerdict);
  });
}

describe("rule library", () => {
  // Rule 1
  it_fires(
    "2015 MacBook Pro + M.2 NVMe → blocker",
    {
      category: "ssd",
      name: "Samsung 990 Pro M.2 2280 NVMe",
      specs: { form: "m.2-2280", nvme: true },
    },
    [
      {
        category: "laptops",
        name: "2015 MacBook Pro",
        specs: { storageFormat: "apple-proprietary-2015" },
      },
    ],
    "fail",
    "mbp-proprietary-blade",
  );

  // Rule 2
  it_fires(
    "SATA M.2 in NVMe-only slot → blocker",
    {
      category: "ssd",
      name: "Crucial BX500 M.2 SATA",
      specs: { form: "m.2 sata" },
    },
    [
      {
        category: "laptops",
        name: "Lenovo ThinkPad X1 Carbon",
        specs: { storage: "m.2-2280-nvme" },
      },
    ],
    "fail",
    "storage-format-mismatch",
  );

  it_fires(
    "matching M.2 2280 NVMe → pass",
    {
      category: "ssd",
      name: "WD Black SN850X M.2 2280 NVMe",
      specs: { form: "m.2-2280-nvme" },
    },
    [{ category: "laptops", name: "Dell XPS 15", specs: { storage: "m.2-2280-nvme" } }],
    "pass",
    "storage-format-match",
  );

  // Rule 3
  it_fires(
    "4K@60 monitor + MacBook Air 2017 → fail (1080p max)",
    { category: "monitor", specs: { resolution: "4k", refreshHz: 60 } },
    [
      {
        category: "laptops",
        name: "MacBook Air 2017",
        specs: { externalDisplayMax: "1080p" },
      },
    ],
    "fail",
    "external-display-4k-unsupported",
  );

  // Rule 4
  it_fires(
    "90W charger + 140W laptop → blocker",
    { category: "charger", specs: { watts: 90 } },
    [{ category: "laptops", specs: { chargingW: 140 } }],
    "fail",
    "charger-underpowered",
  );
  it_fires(
    "140W charger + 140W laptop → pass",
    { category: "charger", specs: { watts: 140 } },
    [{ category: "laptops", specs: { chargingW: 140 } }],
    "pass",
    "charger-sufficient",
  );

  // Rule 5
  it_fires(
    "USB-C charger + Lightning iPhone → blocker",
    { category: "charger", specs: { connector: "usb-c" } },
    [{ category: "phones", specs: { charging: "lightning" } }],
    "fail",
    "phone-charger-lightning-mismatch",
  );
  it_fires(
    "USB-C PD charger + USB-C PD phone → pass",
    { category: "charger", specs: { connector: "usb-c" } },
    [{ category: "phones", specs: { charging: "usb-c-pd" } }],
    "pass",
    "phone-charger-usbc-match",
  );

  // Rule 6
  it_fires(
    "AirPods Pro + BT 4.1 source → warn",
    { category: "airpods", name: "AirPods Pro (2nd Gen)" },
    [{ category: "phones", specs: { bluetooth: "4.1" } }],
    "warn",
    "airpods-bluetooth-too-old",
  );

  // Rule 7
  it_fires(
    "HDMI 2.0 cable + HDMI 2.1 TV 120Hz → warn",
    { category: "hdmi-cable", specs: { hdmi: "2.0" } },
    [{ category: "tvs", specs: { hdmi: "2.1", refreshHz: 120 } }],
    "warn",
    "hdmi-bandwidth-downgrade",
  );

  // Rule 8
  it_fires(
    "wrong printer cartridge → blocker",
    { category: "printer-ink", specs: { cartridgeModel: "HP 67XL Black" } },
    [{ category: "printers", specs: { acceptedCartridges: "HP 65, HP 65XL" } }],
    "fail",
    "printer-ink-model-mismatch",
  );

  // Rule 9
  it_fires(
    "EF lens on RF-mount camera → blocker",
    { category: "camera-lens", specs: { mount: "ef" } },
    [{ category: "cameras", specs: { mount: "rf" } }],
    "fail",
    "lens-mount-mismatch",
  );
  it_fires(
    "EF lens on EF camera → pass",
    { category: "camera-lens", specs: { mount: "ef" } },
    [{ category: "cameras", specs: { mount: "ef" } }],
    "pass",
    "lens-mount-match",
  );

  // Rule 10
  it_fires(
    "iPhone 14 case on iPhone 15 → blocker",
    { category: "smartphone-case", name: "iPhone 14 Pro Silicone Case" },
    [{ category: "phones", specs: { caseFamily: "iphone-15-pro-max" } }],
    "fail",
    "case-family-mismatch",
  );

  it("returns [] when no rules apply", () => {
    const r = runAllRules(
      { category: "mystery", name: "obscure widget" },
      [{ category: "kitchen-gadget", name: "avocado slicer" }],
    );
    expect(r).toEqual([]);
  });
});
