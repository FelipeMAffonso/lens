// S4-W23 — known-device profile table.
// Fills in specs when callers supply `name` without explicit specs.
// Every entry carries provenance notes (model year + key constraints).

import type { CompatItem } from "./types.js";

interface Profile {
  match: RegExp;
  category?: string; // optional override (e.g. "laptops" for MBP name)
  specs: Record<string, string | number | boolean | null>;
}

const PROFILES: Profile[] = [
  // Apple laptops
  {
    match: /\b2015\s+macbook\s+pro\b.*\b(13|13[- ]?inch|retina)\b/i,
    category: "laptops",
    specs: {
      year: 2015,
      form: "retina-pre-2016",
      storage: "proprietary-blade",
      storageFormat: "apple-proprietary-2015",
      ports: "thunderbolt-2, usb-a",
      chargingW: 60,
    },
  },
  {
    match: /\b2015\s+macbook\s+pro\b.*\b(15|15[- ]?inch)\b/i,
    category: "laptops",
    specs: {
      year: 2015,
      form: "retina-pre-2016",
      storage: "proprietary-blade",
      storageFormat: "apple-proprietary-2015",
      ports: "thunderbolt-2, usb-a, hdmi",
      chargingW: 85,
    },
  },
  {
    match: /\bmacbook\s+pro\b.*\b(14|14[- ]?inch|16|16[- ]?inch)\b.*\b(2021|2022|2023)\b/i,
    category: "laptops",
    specs: {
      year: 2023,
      form: "apple-silicon",
      storage: "non-user-serviceable",
      storageFormat: "soldered",
      ports: "usb-c, thunderbolt-4, hdmi, magsafe3",
      chargingW: 140,
    },
  },
  {
    match: /\bmacbook\s+air\b.*\b(2017)\b/i,
    category: "laptops",
    specs: {
      year: 2017,
      form: "macbook-air-legacy",
      ports: "usb-a, thunderbolt-2",
      chargingW: 45,
      externalDisplayMax: "1080p",
    },
  },
  {
    match: /\bdell\s+xps\s+15\b/i,
    category: "laptops",
    specs: {
      year: 2023,
      chargingW: 130,
      ports: "usb-c-pd, hdmi, thunderbolt-4",
      storage: "m.2-2280-nvme",
    },
  },
  {
    match: /\blenovo\s+thinkpad\s+(x1\s+carbon|t14)\b/i,
    category: "laptops",
    specs: {
      chargingW: 65,
      ports: "usb-c-pd, thunderbolt-4, usb-a",
      storage: "m.2-2280-nvme",
    },
  },
  // Phones
  {
    match: /\biphone\s+(15|14)\s+pro(\s+max)?\b/i,
    category: "phones",
    specs: {
      charging: "usb-c-pd",
      usbC: true,
      caseFamily: "iphone-15-pro-max",
      bluetooth: "5.3",
    },
  },
  {
    match: /\biphone\s+1[234]\b/i,
    category: "phones",
    specs: {
      charging: "lightning",
      usbC: false,
      bluetooth: "5.0",
    },
  },
  {
    match: /\bpixel\s+(7|8|9)\b/i,
    category: "phones",
    specs: {
      charging: "usb-c-pd",
      usbC: true,
      bluetooth: "5.3",
    },
  },
  // TVs
  {
    match: /\blg\s+c[23]\b/i,
    category: "tvs",
    specs: { hdmi: "2.1", refreshHz: 120, resolution: "4k" },
  },
  {
    match: /\bsamsung\s+(qn90|s95)\b/i,
    category: "tvs",
    specs: { hdmi: "2.1", refreshHz: 120, resolution: "4k" },
  },
];

/** Enrich missing specs on a CompatItem from its name. */
export function enrichFromName(item: CompatItem): CompatItem {
  if (!item.name) return item;
  const hit = PROFILES.find((p) => p.match.test(item.name!));
  if (!hit) return item;
  const merged: CompatItem = {
    ...item,
    category: item.category === "unknown" || !item.category ? (hit.category ?? item.category) : item.category,
    specs: { ...hit.specs, ...(item.specs ?? {}) }, // caller wins on conflict
  };
  return merged;
}
