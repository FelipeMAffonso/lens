// S1-W9 — parse + validate Opus's JSON output into {axes, verdict}.
// Mirrors the S4-W25 privacy-audit robust parser (fence-tolerant, prose-
// tolerant, per-field validation, silent drop of malformed entries).

import type { Axis, Lean, Verdict } from "./types.js";

export interface ParsedFraming {
  axes: Axis[];
  verdict: Verdict;
}

const DEFAULT: ParsedFraming = {
  axes: [],
  verdict: { leaning: "tied", summary: "(Opus returned no usable framing.)", caveats: [] },
};

export function parseFramingJson(text: string): ParsedFraming {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]!.trim() : text.trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error("compare: no JSON object in Opus response");
  }
  const jsonText = candidate.slice(firstBrace, lastBrace + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`compare: malformed JSON: ${(err as Error).message}`);
  }
  return project(parsed);
}

function toLean(v: unknown): Lean {
  if (v === "A" || v === "B" || v === "tied") return v;
  return "tied";
}

function toAxis(raw: unknown): Axis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key : null;
  const label = typeof o.label === "string" ? o.label : null;
  const aAssessment = typeof o.aAssessment === "string" ? o.aAssessment : null;
  const bAssessment = typeof o.bAssessment === "string" ? o.bAssessment : null;
  const leans = toLean(o.leans);
  if (!key || !label || !aAssessment || !bAssessment) return null;
  return { key, label, aAssessment, bAssessment, leans };
}

function toVerdict(raw: unknown): Verdict {
  if (!raw || typeof raw !== "object") return DEFAULT.verdict;
  const o = raw as Record<string, unknown>;
  const leaning = toLean(o.leaning);
  const summary = typeof o.summary === "string" ? o.summary : DEFAULT.verdict.summary;
  const caveats = Array.isArray(o.caveats)
    ? o.caveats.filter((c): c is string => typeof c === "string")
    : [];
  return { leaning, summary, caveats };
}

function project(raw: unknown): ParsedFraming {
  if (!raw || typeof raw !== "object") return DEFAULT;
  const r = raw as Record<string, unknown>;
  const axes = Array.isArray(r.axes)
    ? r.axes.map(toAxis).filter((a): a is Axis => a !== null)
    : [];
  const verdict = toVerdict(r.verdict);
  return { axes, verdict };
}
