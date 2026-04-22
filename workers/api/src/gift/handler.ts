// CJ-W48 — HTTP glue for the gift-buying flow.

import type { Context } from "hono";
import { bandFor } from "./bands.js";
import { computeGiftAudit } from "./audit.js";
import { questionTemplateFor } from "./question.js";
import {
  createGift,
  getGift,
  getGiftByTokenHash,
  getGiftResponse,
  listGiftsByUser,
  markGiftStatus,
  upsertGiftResponse,
} from "./repo.js";
import { hashToken, signGiftToken, verifyGiftToken } from "./token.js";
import { CreateGiftRequestSchema, SubmitResponseSchema } from "./types.js";

interface EnvBindings {
  LENS_D1?: unknown;
  JWT_SECRET?: string;
  MAGIC_LINK_BASE_URL?: string;
}

function shareUrl(env: EnvBindings, token: string): string {
  const base = env.MAGIC_LINK_BASE_URL ?? "https://lens-b1h.pages.dev";
  return `${base.replace(/\/+$/, "")}/gift/respond?token=${encodeURIComponent(token)}`;
}

function publicGift(row: {
  id: string;
  giver_user_id: string;
  recipient_label: string | null;
  occasion: string | null;
  category: string | null;
  budget_min: number | null;
  budget_max: number;
  status: string;
  expires_at: string;
  created_at: string;
  completed_at: string | null;
  revoked_at: string | null;
}): Record<string, unknown> {
  return {
    id: row.id,
    recipientLabel: row.recipient_label,
    occasion: row.occasion,
    category: row.category,
    budgetMinUsd: row.budget_min === null ? null : Math.round(row.budget_min / 100),
    budgetMaxUsd: Math.round(row.budget_max / 100),
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    revokedAt: row.revoked_at,
  };
}

/** Auto-expire stale rows on read. Returns possibly-updated status. */
async function autoExpire(
  d1: unknown,
  row: {
    id: string;
    status: string;
    expires_at: string;
  },
): Promise<string> {
  if (row.status !== "awaiting") return row.status;
  const now = Date.now();
  const exp = Date.parse(row.expires_at);
  if (!isNaN(exp) && exp <= now) {
    await markGiftStatus(d1 as never, row.id, "expired");
    return "expired";
  }
  return row.status;
}

/* ─── GIVER (auth required) ──────────────────────────────────────────── */

export async function handleCreate(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const secret = c.env.JWT_SECRET;
  if (!secret) return c.json({ error: "jwt_secret_not_configured" }, 503);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateGiftRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  const data = parsed.data;

  if (data.budgetMinUsd !== undefined && data.budgetMinUsd > data.budgetMaxUsd) {
    return c.json({ error: "budget_min_gt_max" }, 400);
  }

  const expiresInDays = data.expiresInDays ?? 14;
  const expiresAtDate = new Date(Date.now() + expiresInDays * 86_400_000);
  const expiresAtEpoch = Math.floor(expiresAtDate.getTime() / 1000);
  const expiresAt = expiresAtDate.toISOString();

  // Mint the signed token with a provisional id, then hash + persist.
  const provisionalId = crypto.randomUUID();
  const token = await signGiftToken(provisionalId, expiresAtEpoch, secret);
  const tokenHash = await hashToken(token);

  const row = await createGift(d1 as never, {
    giverUserId: userId,
    ...(data.recipientLabel !== undefined ? { recipientLabel: data.recipientLabel } : {}),
    ...(data.occasion !== undefined ? { occasion: data.occasion } : {}),
    ...(data.category !== undefined ? { category: data.category } : {}),
    ...(data.budgetMinUsd !== undefined ? { budgetMinCents: Math.round(data.budgetMinUsd * 100) } : {}),
    budgetMaxCents: Math.round(data.budgetMaxUsd * 100),
    shareTokenHash: tokenHash,
    expiresAt,
  });

  // Rebind the token so its `giftId` claim matches the actual persisted row id.
  // The hash changes; overwrite the row's hash. Keeps the public token self-describing.
  const finalToken = await signGiftToken(row.id, expiresAtEpoch, secret);
  const finalHash = await hashToken(finalToken);
  const d1Typed = d1 as {
    prepare: (sql: string) => { bind: (...values: unknown[]) => { run: () => Promise<unknown> } };
  };
  await d1Typed
    .prepare(`UPDATE gift_requests SET share_token_hash = ? WHERE id = ?`)
    .bind(finalHash, row.id)
    .run();
  row.share_token_hash = finalHash;

  return c.json(
    {
      ok: true,
      gift: publicGift(row),
      shareUrl: shareUrl(c.env, finalToken),
      expiresAt,
    },
    201,
  );
}

export async function handleList(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const rows = await listGiftsByUser(d1 as never, userId);
  const gifts: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    await autoExpire(d1, r);
    const resp = await getGiftResponse(d1 as never, r.id);
    gifts.push({ ...publicGift(r), hasResponse: resp !== null });
  }
  return c.json({ gifts, count: gifts.length });
}

export async function handleAudit(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "missing_id" }, 400);
  const row = await getGift(d1 as never, id);
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.giver_user_id !== userId) return c.json({ error: "forbidden" }, 403);
  await autoExpire(d1, row);
  const resp = await getGiftResponse(d1 as never, id);
  if (!resp) {
    return c.json({
      ok: true,
      gift: publicGift(row),
      response: null,
      audit: null,
      note: "Recipient has not responded yet.",
    });
  }
  const criteria = JSON.parse(resp.criteria_json) as Record<string, number>;
  const budgetMaxUsd = row.budget_max / 100;
  const audit = await computeGiftAudit({
    category: row.category,
    budgetMinUsd: row.budget_min === null ? null : row.budget_min / 100,
    budgetMaxUsd,
    criteria,
  });
  return c.json({
    ok: true,
    gift: publicGift(row),
    response: {
      criteria,
      notes: resp.recipient_notes,
      submittedAt: resp.submitted_at,
    },
    audit,
  });
}

export async function handleRevoke(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "missing_id" }, 400);
  const row = await getGift(d1 as never, id);
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.giver_user_id !== userId) return c.json({ error: "forbidden" }, 403);
  await markGiftStatus(d1 as never, id, "revoked");
  return c.json({ ok: true, id, status: "revoked" });
}

/* ─── RECIPIENT (public, token-gated) ─────────────────────────────── */

async function resolveToken(
  c: Context<{ Bindings: EnvBindings }>,
): Promise<
  | { kind: "error"; status: 400 | 401 | 404 | 410 | 503; body: Record<string, unknown> }
  | { kind: "ok"; row: import("../db/schemas.js").GiftRequestRow; tokenHash: string }
> {
  const d1 = c.env.LENS_D1;
  if (!d1) return { kind: "error", status: 503, body: { error: "d1_unavailable" } };
  const secret = c.env.JWT_SECRET;
  if (!secret) return { kind: "error", status: 503, body: { error: "jwt_secret_not_configured" } };
  const token = c.req.query("token");
  if (!token) return { kind: "error", status: 400, body: { error: "missing_token" } };
  const parsed = await verifyGiftToken(token, secret);
  if (!parsed || !parsed.sigValid) {
    return { kind: "error", status: 401, body: { error: "invalid_token" } };
  }
  if (parsed.expired) {
    return { kind: "error", status: 410, body: { error: "expired_token" } };
  }
  const tokenHash = await hashToken(token);
  const row = await getGiftByTokenHash(d1 as never, tokenHash);
  if (!row) return { kind: "error", status: 404, body: { error: "not_found" } };
  if (row.giver_user_id === "") {
    return { kind: "error", status: 404, body: { error: "not_found" } };
  }
  const status = await autoExpire(d1, row);
  if (status === "revoked") {
    return { kind: "error", status: 410, body: { error: "revoked" } };
  }
  if (status === "expired") {
    return { kind: "error", status: 410, body: { error: "expired" } };
  }
  return { kind: "ok", row, tokenHash };
}

export async function handleRecipientGet(
  c: Context<{ Bindings: EnvBindings }>,
): Promise<Response> {
  const resolved = await resolveToken(c);
  if (resolved.kind === "error") return c.json(resolved.body, resolved.status);
  const row = resolved.row;
  const maxUsd = row.budget_max / 100;
  const band = bandFor(maxUsd);
  return c.json({
    ok: true,
    gift: {
      id: row.id,
      recipientLabel: row.recipient_label,
      occasion: row.occasion,
      category: row.category,
      budgetBand: band.label,
      budgetBandHint: band.hint,
    },
    expiresAt: row.expires_at,
    questionTemplate: {
      criteria: questionTemplateFor(row.category),
      notesPlaceholder: "Anything else we should know?",
    },
  });
}

export async function handleRecipientPost(
  c: Context<{ Bindings: EnvBindings }>,
): Promise<Response> {
  const resolved = await resolveToken(c);
  if (resolved.kind === "error") return c.json(resolved.body, resolved.status);
  const row = resolved.row;
  const body = await c.req.json().catch(() => null);
  const parsed = SubmitResponseSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
  const d1 = c.env.LENS_D1;
  await upsertGiftResponse(
    d1 as never,
    row.id,
    parsed.data.criteria,
    parsed.data.notes ?? null,
  );
  await markGiftStatus(d1 as never, row.id, "completed");
  return c.json({
    ok: true,
    acknowledged: true,
    message: "Thanks! Your answer has been shared with the giver.",
  });
}
