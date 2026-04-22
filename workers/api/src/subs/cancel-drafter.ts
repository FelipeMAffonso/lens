// S6-W36 — cancellation letter renderer.
// Reuses the S6-W35 token substitution and layers state-law + enforcement-
// agency resolution on top. Missing user inputs surface as visible
// [TODO: <key>] sentinels inside the letter.

import { substitute } from "../returns/render.js";
import type { SubscriptionRow } from "./types.js";

export interface CancelDraftInput {
  userState?: string;          // "CA", "NY", "IL", "VT", or anything else → DEFAULT
  userName?: string;
  userIdentifier?: string;     // account email or username
  planName?: string;           // optional plan/tier label
  signupDate?: string;         // ISO date
  cancelDate?: string;         // ISO date; default: today
}

export interface CancelDraftTemplate {
  subject: string;
  bodyTemplate: string;
  stateLawSnippets: Record<string, string>;
}

export interface CancelDraft {
  subject: string;
  body: string;
  to: string | null;
  format: "email";
  stateLaw: { state: string; citation: string };
  enforcementAgency: string;
  tokens: Record<string, string | undefined | null>;
}

/**
 * State Attorney General / Consumer Protection office for states with click-
 * to-cancel statutes; every other state + DC falls back to the FTC.
 */
const STATE_AG: Record<string, string> = {
  CA: "California Department of Justice / Office of the Attorney General",
  NY: "New York Department of State Division of Consumer Protection",
  IL: "Illinois Attorney General Consumer Fraud Bureau",
  VT: "Vermont Office of the Attorney General Consumer Assistance Program",
};

const DEFAULT_AGENCY = "the Federal Trade Commission (reportfraud.ftc.gov)";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveState(
  snippets: Record<string, string>,
  userState: string | undefined,
): { state: string; citation: string } {
  const upper = (userState ?? "").toUpperCase();
  if (upper && snippets[upper]) {
    return { state: upper, citation: snippets[upper] };
  }
  return { state: "DEFAULT", citation: snippets["DEFAULT"] ?? "" };
}

export function renderCancelDraft(
  row: SubscriptionRow,
  template: CancelDraftTemplate,
  input: CancelDraftInput = {},
): CancelDraft {
  const upperState = (input.userState ?? "").toUpperCase();
  const stateLaw = resolveState(template.stateLawSnippets, input.userState);
  const enforcementAgency = upperState && STATE_AG[upperState] ? STATE_AG[upperState]! : DEFAULT_AGENCY;

  const signupDate = input.signupDate ?? row.first_seen.slice(0, 10);
  const cancelDate = input.cancelDate ?? todayIso();

  const tokens: Record<string, string | undefined | null> = {
    service_name: row.service,
    cancel_date: cancelDate,
    user_identifier: input.userIdentifier,
    plan_name: input.planName ?? row.service,
    signup_date: signupDate,
    state_law_citation: stateLaw.citation,
    enforcement_agency: enforcementAgency,
    user_name: input.userName,
  };

  const subject = substitute(template.subject, tokens);
  const body = substitute(template.bodyTemplate, tokens);

  return {
    subject,
    body,
    to: null,
    format: "email",
    stateLaw,
    enforcementAgency,
    tokens,
  };
}
