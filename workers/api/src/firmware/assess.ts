// S7-W38 — severity banding for matched advisories.
// CVSS-driven; falls back to the advisory's declared severity when CVSS is
// null. Separates notify (intervention + email) vs dashboard-only vs nothing.

import type { AssessedMatch, FirmwareMatch, Severity } from "./types.js";

export function bandFromCvss(cvss: number | null, declared: Severity): AssessedMatch["band"] {
  if (cvss === null) {
    if (declared === "critical") return "critical";
    if (declared === "high") return "high";
    if (declared === "low") return "low";
    if (declared === "informational") return "informational";
    return "medium";
  }
  if (cvss >= 9.0) return "critical";
  if (cvss >= 7.0) return "high";
  if (cvss >= 4.0) return "medium";
  return "low";
}

export function assessMatches(matches: FirmwareMatch[]): AssessedMatch[] {
  return matches.map((m) => {
    const band = bandFromCvss(m.advisory.cvssScore, m.advisory.severity);
    const shouldNotify = band === "critical" || band === "high";
    const shouldDashboardOnly = band === "medium" || band === "low" || band === "informational";
    return { ...m, band, shouldNotify, shouldDashboardOnly };
  });
}
