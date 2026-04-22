// S7-W38 — advisory source loader. Fixture mode returns the curated dataset;
// live mode is a scaffold (returns [] + logs) until PSIRT scrapers land.

import { FIXTURE_ADVISORIES } from "./fixtures.js";
import type { FirmwareAdvisory } from "./types.js";

export interface FirmwareSourceEnv {
  LENS_FIRMWARE_MODE?: string;
}

export async function fetchAdvisories(env: FirmwareSourceEnv): Promise<FirmwareAdvisory[]> {
  const mode = (env.LENS_FIRMWARE_MODE ?? "fixture").toLowerCase();
  if (mode === "fixture" || mode === "") return FIXTURE_ADVISORIES;
  // Live mode scaffold — would walk manufacturer PSIRT + NVD JSON feed here.
  console.warn("[firmware.source] live mode not yet implemented — returning fixtures");
  return FIXTURE_ADVISORIES;
}
