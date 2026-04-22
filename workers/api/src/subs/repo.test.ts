import { describe, expect, it } from "vitest";
import { createMemoryD1 } from "../db/memory-d1.js";
import {
  deleteById,
  findByService,
  getById,
  listByUser,
  listUpcomingRenewals,
  setActive,
  upsertFromClassified,
} from "./repo.js";
import type { ClassifiedSubscription } from "./types.js";

function d1() {
  const db = createMemoryD1();
  db._setPrimaryKey("subscriptions", "id");
  return db;
}

function cs(partial: Partial<ClassifiedSubscription> & { service: string }): ClassifiedSubscription {
  return {
    matched: true,
    service: partial.service,
    currency: partial.currency ?? "USD",
    intent: partial.intent ?? "renewal",
    confidence: partial.confidence ?? 0.9,
    ...(partial.amount !== undefined ? { amount: partial.amount } : {}),
    ...(partial.cadence !== undefined ? { cadence: partial.cadence } : {}),
    ...(partial.nextRenewalAt !== undefined ? { nextRenewalAt: partial.nextRenewalAt } : {}),
    ...(partial.sourceMessageId !== undefined ? { sourceMessageId: partial.sourceMessageId } : {}),
  };
}

describe("upsertFromClassified", () => {
  it("inserts a fresh row", async () => {
    const db = d1();
    const row = await upsertFromClassified(db, {
      userId: "u1",
      classified: cs({ service: "Netflix", amount: 22.99, cadence: "monthly", nextRenewalAt: "2026-05-22" }),
      source: "gmail",
    });
    expect(row.user_id).toBe("u1");
    expect(row.service).toBe("Netflix");
    expect(row.amount).toBe(22.99);
    expect(row.cadence).toBe("monthly");
    expect(row.active).toBe(1);
    expect(row.detected_intent).toBe("renewal");
  });

  it("upserts by (user, service) — same service twice yields one row", async () => {
    const db = d1();
    await upsertFromClassified(db, {
      userId: "u1",
      classified: cs({ service: "Netflix", amount: 15.99, cadence: "monthly" }),
      source: "gmail",
    });
    await upsertFromClassified(db, {
      userId: "u1",
      classified: cs({ service: "Netflix", amount: 22.99, cadence: "monthly", nextRenewalAt: "2026-06-22" }),
      source: "gmail",
    });
    const rows = await listByUser(db, "u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(22.99); // updated
    expect(rows[0]!.next_renewal_at).toBe("2026-06-22");
  });

  it("cancellation intent flips active to 0", async () => {
    const db = d1();
    await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "Netflix", amount: 15.99 }),
      source: "gmail",
    });
    await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "Netflix", intent: "cancellation" }),
      source: "gmail",
    });
    const rows = await listByUser(db, "u");
    expect(rows[0]!.active).toBe(0);
    expect(rows[0]!.detected_intent).toBe("cancellation");
  });

  it("does not clobber existing amount when the renewal lacks one", async () => {
    const db = d1();
    await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "NYT", amount: 195, cadence: "yearly" }),
      source: "gmail",
    });
    await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "NYT" }),
      source: "gmail",
    });
    const row = await findByService(db, "u", "NYT");
    expect(row?.amount).toBe(195);
    expect(row?.cadence).toBe("yearly");
  });

  it("isolates users by user_id", async () => {
    const db = d1();
    await upsertFromClassified(db, {
      userId: "u1",
      classified: cs({ service: "Netflix" }),
      source: "gmail",
    });
    await upsertFromClassified(db, {
      userId: "u2",
      classified: cs({ service: "Netflix" }),
      source: "gmail",
    });
    expect((await listByUser(db, "u1")).length).toBe(1);
    expect((await listByUser(db, "u2")).length).toBe(1);
  });
});

describe("listByUser + activeOnly", () => {
  it("returns only active rows when activeOnly = true", async () => {
    const db = d1();
    await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "Netflix" }),
      source: "gmail",
    });
    await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "Dropbox Plus", intent: "cancellation" }),
      source: "gmail",
    });
    expect((await listByUser(db, "u")).length).toBe(2);
    expect((await listByUser(db, "u", { activeOnly: true })).length).toBe(1);
  });
});

describe("setActive + deleteById + getById", () => {
  it("flips active flag", async () => {
    const db = d1();
    const row = await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "Spotify Premium" }),
      source: "gmail",
    });
    await setActive(db, row.id, false);
    expect((await getById(db, row.id))!.active).toBe(0);
  });
  it("deletes a row", async () => {
    const db = d1();
    const row = await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "Adobe Creative Cloud" }),
      source: "gmail",
    });
    await deleteById(db, row.id);
    expect(await getById(db, row.id)).toBeNull();
  });
});

describe("listUpcomingRenewals", () => {
  it("returns only active + next_renewal_at within the window", async () => {
    const db = d1();
    const today = new Date().toISOString().slice(0, 10);
    const in3 = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

    await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "A", nextRenewalAt: today }),
      source: "gmail",
    });
    await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "B", nextRenewalAt: in3 }),
      source: "gmail",
    });
    await upsertFromClassified(db, {
      userId: "u",
      classified: cs({ service: "C", nextRenewalAt: in14 }),
      source: "gmail",
    });
    const within7 = await listUpcomingRenewals(db, "u", 7);
    expect(within7.map((r) => r.service).sort()).toEqual(["A", "B"]);
  });
});
