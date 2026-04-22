// S4-W25 — parse + validate Opus's JSON output into a PrivacyAudit.
// Robust to markdown fences + surrounding prose (same defense as S4-W22).

import type { DarkPatternEntry, DataCollectedEntry, PrivacyAudit, SharedWithEntry } from "./types.js";

export function parseAuditJson(text: string): PrivacyAudit {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]!.trim() : text.trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error("privacy-audit: no JSON object in Opus response");
  }
  const json = candidate.slice(firstBrace, lastBrace + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`privacy-audit: malformed JSON: ${(err as Error).message}`);
  }
  return project(parsed);
}

function project(raw: unknown): PrivacyAudit {
  if (!raw || typeof raw !== "object") return EMPTY;
  const r = raw as Record<string, unknown>;

  const dataCollected = Array.isArray(r.dataCollected)
    ? r.dataCollected
        .map((x): DataCollectedEntry | null => {
          if (!x || typeof x !== "object") return null;
          const o = x as Record<string, unknown>;
          const category = typeof o.category === "string" ? o.category : null;
          const types = Array.isArray(o.types) ? o.types.filter((t): t is string => typeof t === "string") : [];
          const purpose = typeof o.purpose === "string" ? o.purpose : "";
          if (!category) return null;
          return { category, types, purpose };
        })
        .filter((x): x is DataCollectedEntry => x !== null)
    : [];

  const sharedWithThirdParties = Array.isArray(r.sharedWithThirdParties)
    ? r.sharedWithThirdParties
        .map((x): SharedWithEntry | null => {
          if (!x || typeof x !== "object") return null;
          const o = x as Record<string, unknown>;
          const partyCategory = typeof o.partyCategory === "string" ? o.partyCategory : null;
          const purpose = typeof o.purpose === "string" ? o.purpose : "";
          if (!partyCategory) return null;
          return { partyCategory, purpose };
        })
        .filter((x): x is SharedWithEntry => x !== null)
    : [];

  const retentionRaw = (r.retention as Record<string, unknown> | undefined) ?? {};
  const retention = {
    declared: Boolean(retentionRaw.declared),
    period: typeof retentionRaw.period === "string" ? retentionRaw.period : null,
  };

  const deletionRaw = (r.deletion as Record<string, unknown> | undefined) ?? {};
  const deletion = {
    available: Boolean(deletionRaw.available),
    mechanism: typeof deletionRaw.mechanism === "string" ? deletionRaw.mechanism : null,
  };

  const consentDarkPatterns = Array.isArray(r.consentDarkPatterns)
    ? r.consentDarkPatterns
        .map((x): DarkPatternEntry | null => {
          if (!x || typeof x !== "object") return null;
          const o = x as Record<string, unknown>;
          const pattern = typeof o.pattern === "string" ? o.pattern : null;
          const severity = o.severity === "blocker" || o.severity === "warn" ? o.severity : "warn";
          const evidence = typeof o.evidence === "string" ? o.evidence.slice(0, 200) : "";
          if (!pattern) return null;
          return { pattern, severity, evidence };
        })
        .filter((x): x is DarkPatternEntry => x !== null)
    : [];

  const regulatoryFrameworks = Array.isArray(r.regulatoryFrameworks)
    ? r.regulatoryFrameworks.filter((x): x is string => typeof x === "string")
    : [];

  return {
    dataCollected,
    sharedWithThirdParties,
    retention,
    deletion,
    consentDarkPatterns,
    regulatoryFrameworks,
  };
}

export const EMPTY: PrivacyAudit = {
  dataCollected: [],
  sharedWithThirdParties: [],
  retention: { declared: false, period: null },
  deletion: { available: false, mechanism: null },
  consentDarkPatterns: [],
  regulatoryFrameworks: [],
};
