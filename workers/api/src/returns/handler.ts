// S6-W35 — HTTP glue for POST /returns/draft.

import type { Context } from "hono";
import { createIntervention } from "../db/repos/interventions.js";
import { registry as packRegistry } from "../packs/registry.js";
import { renderDraft } from "./render.js";
import {
  ACTION_VERB,
  DEFAULT_SPECIFIC_RIGHT,
  ReturnDraftRequestSchema,
  type ActionType,
  type ReturnDraftResponse,
} from "./types.js";

interface EnvBindings {
  LENS_D1?: unknown;
}

interface PurchaseRow {
  id: string;
  user_id: string;
  retailer: string | null;
  product_name: string;
  order_id: string | null;
  purchased_at: string;
  raw_payload_json: string | null;
}

/**
 * POST /returns/draft — pre-fills an intervention/draft-magnuson-moss-return
 * letter from purchase + pack + user-supplied defect description.
 */
export async function handleReturnDraft(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = ReturnDraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  }
  const {
    purchaseId,
    defectDescription,
    actionType,
    specificRight,
    userName,
    userContact,
  } = parsed.data;

  const action: ActionType = actionType ?? "return";

  const d1Typed = d1 as {
    prepare: (sql: string) => {
      bind: (...values: unknown[]) => { first: <T>() => Promise<T | null> };
    };
  };
  const purchase = await d1Typed
    .prepare(
      `SELECT id, user_id, retailer, product_name, order_id, purchased_at, raw_payload_json
       FROM purchases WHERE id = ? LIMIT 1`,
    )
    .bind(purchaseId)
    .first<PurchaseRow>();
  if (!purchase) return c.json({ error: "not_found" }, 404);
  if (purchase.user_id !== userId) return c.json({ error: "forbidden" }, 403);

  const pack = packRegistry.bySlug.get("intervention/draft-magnuson-moss-return");
  if (!pack || pack.type !== "intervention") {
    return c.json({ error: "pack_not_found", slug: "intervention/draft-magnuson-moss-return" }, 500);
  }
  const packBody = (pack as unknown as { body: { template: { subject: string; bodyTemplate: string }; failureFallback?: { nextIntervention?: string } } }).body;

  const tokens: Record<string, string | undefined | null> = {
    seller_name: purchase.retailer ?? "Customer Service",
    product_name: purchase.product_name,
    order_id: purchase.order_id,
    purchase_date: purchase.purchased_at.slice(0, 10),
    defect_description: defectDescription,
    specific_right: specificRight ?? DEFAULT_SPECIFIC_RIGHT[action],
    user_name: userName,
    user_contact: userContact,
    _verb: ACTION_VERB[action],
  };
  const rendered = renderDraft({
    subjectTemplate: packBody.template.subject,
    bodyTemplate: packBody.template.bodyTemplate,
    tokens,
  });

  // Extract seller email from purchase.raw_payload_json if present.
  let toEmail: string | null = null;
  if (purchase.raw_payload_json) {
    try {
      const raw = JSON.parse(purchase.raw_payload_json) as Record<string, unknown>;
      if (typeof raw.sellerEmail === "string") toEmail = raw.sellerEmail;
    } catch {
      // ignore
    }
  }

  const intervention = await createIntervention(d1 as never, {
    userId,
    packSlug: "intervention/draft-magnuson-moss-return",
    payload: {
      action,
      subject: rendered.subject,
      body: rendered.body,
      to: toEmail,
      tokens,
    },
    relatedPurchaseId: purchase.id,
  });

  const response: ReturnDraftResponse = {
    ok: true,
    interventionId: intervention.id,
    draft: {
      subject: rendered.subject,
      body: rendered.body,
      to: toEmail,
      format: "email",
    },
    templateSource: `intervention/draft-magnuson-moss-return@${(pack as { version: string }).version}`,
    fallback: packBody.failureFallback?.nextIntervention ?? "intervention/file-ftc-complaint",
    generatedAt: new Date().toISOString(),
  };
  return c.json(response);
}
