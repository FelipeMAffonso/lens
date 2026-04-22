// S6-W35 — returns / warranty claim types.

import { z } from "zod";

export const ActionTypeEnum = z.enum(["return", "warranty-service", "replacement", "refund"]);
export type ActionType = z.infer<typeof ActionTypeEnum>;

export const ReturnDraftRequestSchema = z
  .object({
    purchaseId: z.string().min(1).max(64),
    defectDescription: z.string().min(1).max(2_000),
    actionType: ActionTypeEnum.optional(),
    specificRight: z.string().min(1).max(256).optional(),
    userName: z.string().min(1).max(128).optional(),
    userContact: z.string().min(1).max(256).optional(),
  })
  .strict();
export type ReturnDraftRequest = z.infer<typeof ReturnDraftRequestSchema>;

export interface Draft {
  subject: string;
  body: string;
  to: string | null;
  format: "email";
}

export interface ReturnDraftResponse {
  ok: true;
  interventionId: string;
  draft: Draft;
  templateSource: string;
  fallback: string;
  generatedAt: string;
}

export const DEFAULT_SPECIFIC_RIGHT: Record<ActionType, string> = {
  return: "refund of the purchase price",
  "warranty-service": "repair or replacement under the Limited Warranty",
  replacement: "a replacement unit",
  refund: "refund of the purchase price",
};

export const ACTION_VERB: Record<ActionType, string> = {
  return: "return and refund",
  "warranty-service": "warranty service",
  replacement: "replacement",
  refund: "refund",
};
