// CJ-W47 — HTTP glue for household profiles + effective-preference resolver.

import type { Context } from "hono";
import { z } from "zod";
import {
  archiveMember,
  createMember,
  getMember,
  listMembersByUser,
  patchMember,
} from "../db/repos/household.js";
import type { HouseholdRole } from "../db/schemas.js";
import { resolveEffectivePreference } from "./resolver.js";

interface EnvBindings {
  LENS_D1?: unknown;
}

const RoleSchema = z.enum(["owner", "adult", "teen", "child", "guest"]).nullable();

const CreateMemberSchema = z
  .object({
    name: z.string().min(1).max(128),
    role: RoleSchema.optional(),
    relationship: z.string().max(128).nullable().optional(),
    birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
  })
  .strict();

const PatchMemberSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    role: RoleSchema.optional(),
    relationship: z.string().max(128).nullable().optional(),
    birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

/**
 * GET /household/members
 */
export async function handleList(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const includeArchived = c.req.query("includeArchived") === "1";
  const rows = await listMembersByUser(d1 as never, userId, { includeArchived });
  return c.json({ members: rows, count: rows.length });
}

/**
 * POST /household/members
 */
export async function handleCreate(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const body = await c.req.json().catch(() => null);
  const parsed = CreateMemberSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);

  const row = await createMember(d1 as never, {
    userId,
    name: parsed.data.name,
    role: (parsed.data.role ?? null) as HouseholdRole | null,
    relationship: parsed.data.relationship ?? null,
    birthYear: parsed.data.birthYear ?? null,
  });
  return c.json({ member: row }, 201);
}

/**
 * PATCH /household/members/:id
 */
export async function handlePatch(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "missing_id" }, 400);

  const existing = await getMember(d1 as never, id);
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (existing.user_id !== userId) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = PatchMemberSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);

  const updated = await patchMember(d1 as never, id, {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.role !== undefined ? { role: parsed.data.role as HouseholdRole | null } : {}),
    ...(parsed.data.relationship !== undefined ? { relationship: parsed.data.relationship } : {}),
    ...(parsed.data.birthYear !== undefined ? { birthYear: parsed.data.birthYear } : {}),
    ...(parsed.data.archived !== undefined ? { archived: parsed.data.archived } : {}),
  });
  return c.json({ member: updated });
}

/**
 * DELETE /household/members/:id — soft delete (archived_at set).
 */
export async function handleDelete(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const userId = c.get("userId") as string | undefined;
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  const id = c.req.param("id") ?? "";
  if (!id) return c.json({ error: "missing_id" }, 400);
  const existing = await getMember(d1 as never, id);
  if (!existing) return c.json({ error: "not_found" }, 404);
  if (existing.user_id !== userId) return c.json({ error: "forbidden" }, 403);
  await archiveMember(d1 as never, id);
  return c.json({ ok: true, id });
}

/**
 * GET /preferences/effective?category=<X>&profileId=<Y>?
 */
export async function handleEffective(
  c: Context<{ Bindings: EnvBindings; Variables: { userId?: string; anonUserId?: string } }>,
): Promise<Response> {
  const d1 = c.env.LENS_D1;
  if (!d1) return c.json({ error: "d1_unavailable" }, 503);
  const category = c.req.query("category") ?? "";
  if (!category) return c.json({ error: "missing_category" }, 400);
  const profileId = c.req.query("profileId") || null;
  const userId = c.get("userId") as string | undefined;
  const anonUserId = c.get("anonUserId") as string | undefined;
  const result = await resolveEffectivePreference(
    d1 as never,
    {
      ...(userId ? { userId } : {}),
      ...(anonUserId ? { anonUserId } : {}),
    },
    category,
    profileId,
  );
  return c.json(result);
}
