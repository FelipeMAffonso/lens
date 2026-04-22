// S4-W23 — compatibility rule library.
// Each rule is a pure function returning RuleResult | null. Rules return null
// when they don't apply to the (target, equipment) pair. Every rule has
// provenance in a comment; add new rules via PR with evidence.

import type { CompatItem, RuleResult } from "./types.js";

type RuleFn = (target: CompatItem, equip: CompatItem, idx: number) => RuleResult | null;

/** Read a string spec with lowercase normalization + fallback. */
function str(item: CompatItem, key: string): string | null {
  const v = item.specs?.[key];
  if (typeof v === "string") return v.toLowerCase();
  if (typeof v === "number" || typeof v === "boolean") return String(v).toLowerCase();
  return null;
}
function num(item: CompatItem, key: string): number | null {
  const v = item.specs?.[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Rule 1: 2015 MBP (pre-2016 Retina) proprietary blade — generic M.2 SSDs
// physically don't fit. (Apple used a proprietary NGFF connector until
// 2016; source: iFixit MacBook Pro 2015 teardown.)
const ruleMbpProprietaryStorage: RuleFn = (target, equip, idx) => {
  if (target.category !== "ssd") return null;
  if (equip.category !== "laptops") return null;
  const equipFormat = str(equip, "storageFormat") ?? str(equip, "storage");
  if (!equipFormat || !equipFormat.includes("apple-proprietary")) return null;
  const targetFormFactor = str(target, "formFactor") ?? str(target, "form") ?? (target.name ?? "").toLowerCase();
  if (/m\.?2|2280|nvme/i.test(targetFormFactor)) {
    return {
      id: "mbp-proprietary-blade",
      verdict: "fail",
      severity: "blocker",
      explanation:
        "The 2015 MacBook Pro uses Apple's proprietary blade SSD connector. M.2 / 2280 / standard NVMe drives do not physically fit without an adapter.",
      equipmentIndex: idx,
    };
  }
  return null;
};

// Rule 2: generic laptop storage form factor match.
const ruleStorageFormat: RuleFn = (target, equip, idx) => {
  if (target.category !== "ssd") return null;
  if (equip.category !== "laptops") return null;
  const equipStorage = str(equip, "storage");
  if (!equipStorage) return null;
  if (equipStorage.includes("apple-proprietary")) return null; // covered by rule 1
  const targetFormat = (str(target, "formFactor") ?? str(target, "form") ?? (target.name ?? "").toLowerCase());
  if (!targetFormat) return null;
  // m.2-2280-nvme + m.2 2280 NVMe → pass
  if (equipStorage.includes("m.2-2280") && /m\.?2.*2280/.test(targetFormat)) {
    return {
      id: "storage-format-match",
      verdict: "pass",
      severity: "info",
      explanation: "Target form factor (M.2 2280 NVMe) matches the laptop's storage slot.",
      equipmentIndex: idx,
    };
  }
  if (equipStorage.includes("m.2") && /sata/.test(targetFormat) && !/nvme/.test(targetFormat)) {
    return {
      id: "storage-format-mismatch",
      verdict: "fail",
      severity: "blocker",
      explanation: "Laptop expects M.2 NVMe, but the target SSD is M.2 SATA. Interfaces are mechanically similar but electrically incompatible in NVMe-only slots.",
      equipmentIndex: idx,
    };
  }
  return null;
};

// Rule 3: USB-C monitor at 4K@60Hz requires DP Alt-Mode on the source.
// Early MacBook Air 2017 supports only 1080p external displays.
const ruleExternalDisplay4k: RuleFn = (target, equip, idx) => {
  if (target.category !== "monitor" && target.category !== "monitor-cable") return null;
  if (equip.category !== "laptops") return null;
  const targetMax = (str(target, "maxResolution") ?? str(target, "resolution") ?? "").toLowerCase();
  const targetHz = num(target, "refreshHz");
  const laptopMax = (str(equip, "externalDisplayMax") ?? "").toLowerCase();
  if (!targetMax.includes("4k") || (targetHz ?? 0) < 60) return null;
  if (laptopMax && !laptopMax.includes("4k")) {
    return {
      id: "external-display-4k-unsupported",
      verdict: "fail",
      severity: "info",
      explanation: `Laptop maxes out at ${laptopMax}; the 4K@${targetHz ?? "60"}Hz monitor will downscale.`,
      equipmentIndex: idx,
    };
  }
  return null;
};

// Rule 4: laptop charger wattage match.
const ruleLaptopChargerWatt: RuleFn = (target, equip, idx) => {
  if (target.category !== "charger" && target.category !== "power-adapter") return null;
  if (equip.category !== "laptops") return null;
  const targetW = num(target, "watts") ?? num(target, "pdW") ?? num(target, "wattage");
  const needW = num(equip, "chargingW");
  if (targetW === null || needW === null) return null;
  if (targetW < needW) {
    return {
      id: "charger-underpowered",
      verdict: "fail",
      severity: "blocker",
      explanation: `Laptop needs ${needW}W; charger delivers only ${targetW}W. It will trickle-charge at best and may not charge under load.`,
      equipmentIndex: idx,
    };
  }
  return {
    id: "charger-sufficient",
    verdict: "pass",
    severity: "info",
    explanation: `Charger (${targetW}W) meets or exceeds the laptop's ${needW}W requirement.`,
    equipmentIndex: idx,
  };
};

// Rule 5: phone charging protocol match.
const rulePhoneCharger: RuleFn = (target, equip, idx) => {
  if (target.category !== "charger" && target.category !== "cable") return null;
  if (equip.category !== "phones") return null;
  const phoneCharging = str(equip, "charging");
  const targetConnector = str(target, "connector") ?? str(target, "plug") ?? (target.name ?? "").toLowerCase();
  if (phoneCharging === "lightning" && targetConnector && !/lightning/.test(targetConnector)) {
    return {
      id: "phone-charger-lightning-mismatch",
      verdict: "fail",
      severity: "blocker",
      explanation: "Phone uses Lightning; the cable/charger needs a Lightning connector (or MFi-certified USB-C → Lightning).",
      equipmentIndex: idx,
    };
  }
  if (phoneCharging === "usb-c-pd" && targetConnector && /usb-?c/.test(targetConnector)) {
    return {
      id: "phone-charger-usbc-match",
      verdict: "pass",
      severity: "info",
      explanation: "USB-C PD phone + USB-C PD charger — compatible.",
      equipmentIndex: idx,
    };
  }
  return null;
};

// Rule 6: AirPods Pro → Bluetooth ≥ 5.0 source.
const ruleAirPodsBluetooth: RuleFn = (target, equip, idx) => {
  if (target.category !== "airpods" && target.category !== "earbuds") return null;
  if (equip.category !== "phones" && equip.category !== "laptops") return null;
  const targetName = (target.name ?? "").toLowerCase();
  if (!/airpods\s+pro/.test(targetName) && !str(target, "requiresBluetooth")) return null;
  const sourceBt = str(equip, "bluetooth");
  if (!sourceBt) return null;
  const major = parseFloat(sourceBt);
  if (Number.isFinite(major) && major < 5.0) {
    return {
      id: "airpods-bluetooth-too-old",
      verdict: "warn",
      severity: "info",
      explanation: `AirPods Pro work best with Bluetooth 5.0+. Source reports Bluetooth ${sourceBt}; expect connection drops + reduced audio bitrate.`,
      equipmentIndex: idx,
    };
  }
  return null;
};

// Rule 7: HDMI 2.1 TV + HDMI 2.0 cable → 4K@120Hz not deliverable.
const ruleHdmiBandwidth: RuleFn = (target, equip, idx) => {
  if (target.category !== "hdmi-cable" && target.category !== "cable") return null;
  if (equip.category !== "tvs") return null;
  const targetHdmi = str(target, "hdmi");
  const tvHdmi = str(equip, "hdmi");
  const tvHz = num(equip, "refreshHz");
  if (!targetHdmi || !tvHdmi) return null;
  if (tvHdmi === "2.1" && targetHdmi === "2.0" && (tvHz ?? 0) >= 120) {
    return {
      id: "hdmi-bandwidth-downgrade",
      verdict: "warn",
      severity: "info",
      explanation: "TV supports HDMI 2.1 (4K@120Hz), but the cable is HDMI 2.0 and caps at 4K@60Hz. Replace with an HDMI 2.1 / Ultra High Speed cable to unlock the TV's full bandwidth.",
      equipmentIndex: idx,
    };
  }
  return null;
};

// Rule 8: printer ink model match.
const rulePrinterInk: RuleFn = (target, equip, idx) => {
  if (target.category !== "printer-ink" && target.category !== "ink-cartridge") return null;
  if (equip.category !== "printers") return null;
  const targetModel = str(target, "cartridgeModel") ?? (target.name ?? "").toLowerCase();
  const accepted = str(equip, "acceptedCartridges");
  if (!targetModel || !accepted) return null;
  const acceptedList = accepted.split(/[,;]\s*/);
  if (!acceptedList.some((a) => targetModel.includes(a.trim()))) {
    return {
      id: "printer-ink-model-mismatch",
      verdict: "fail",
      severity: "blocker",
      explanation: `Printer accepts cartridge IDs: ${accepted}. Target cartridge "${targetModel}" is not in that list.`,
      equipmentIndex: idx,
    };
  }
  return {
    id: "printer-ink-model-match",
    verdict: "pass",
    severity: "info",
    explanation: "Cartridge model is listed as supported by the printer.",
    equipmentIndex: idx,
  };
};

// Rule 9: camera lens mount match.
const ruleLensMount: RuleFn = (target, equip, idx) => {
  if (target.category !== "camera-lens" && target.category !== "lens") return null;
  if (equip.category !== "cameras" && equip.category !== "camera") return null;
  const targetMount = str(target, "mount");
  const cameraMount = str(equip, "mount");
  if (!targetMount || !cameraMount) return null;
  if (targetMount !== cameraMount) {
    return {
      id: "lens-mount-mismatch",
      verdict: "fail",
      severity: "blocker",
      explanation: `Camera uses ${cameraMount} mount; lens is ${targetMount}. A mount adapter may be available but will disable AF / communication on many lenses.`,
      equipmentIndex: idx,
    };
  }
  return {
    id: "lens-mount-match",
    verdict: "pass",
    severity: "info",
    explanation: `Matching ${cameraMount} mount.`,
    equipmentIndex: idx,
  };
};

// Rule 10: smartphone case model family match.
const ruleCaseFamily: RuleFn = (target, equip, idx) => {
  if (target.category !== "smartphone-case" && target.category !== "phone-case") return null;
  if (equip.category !== "phones") return null;
  const targetFamily = str(target, "caseFamily") ?? (target.name ?? "").toLowerCase();
  const phoneFamily = str(equip, "caseFamily");
  if (!targetFamily || !phoneFamily) return null;
  if (!targetFamily.includes(phoneFamily)) {
    return {
      id: "case-family-mismatch",
      verdict: "fail",
      severity: "blocker",
      explanation: `Case is for "${targetFamily}" but phone is "${phoneFamily}". Case will not fit — button cutouts + camera module positions differ per generation.`,
      equipmentIndex: idx,
    };
  }
  return {
    id: "case-family-match",
    verdict: "pass",
    severity: "info",
    explanation: `Case designed for ${phoneFamily}.`,
    equipmentIndex: idx,
  };
};

const RULES: RuleFn[] = [
  ruleMbpProprietaryStorage,
  ruleStorageFormat,
  ruleExternalDisplay4k,
  ruleLaptopChargerWatt,
  rulePhoneCharger,
  ruleAirPodsBluetooth,
  ruleHdmiBandwidth,
  rulePrinterInk,
  ruleLensMount,
  ruleCaseFamily,
];

export function runAllRules(target: CompatItem, equipment: CompatItem[]): RuleResult[] {
  const out: RuleResult[] = [];
  for (let i = 0; i < equipment.length; i++) {
    for (const rule of RULES) {
      const r = rule(target, equipment[i]!, i);
      if (r) out.push(r);
    }
  }
  return out;
}

export function ruleCount(): number {
  return RULES.length;
}
