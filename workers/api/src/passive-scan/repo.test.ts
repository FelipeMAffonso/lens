// S4-W22 — Persistence tests with a stubbed D1.

import { describe, expect, it, vi } from "vitest";
import { persistScan } from "./repo.js";
import type { ConfirmedHit } from "./types.js";

function stubD1() {
  const binds: unknown[][] = [];
  const sqls: string[] = [];
  const prepare = vi.fn((sql: string) => {
    sqls.push(sql);
    const prep = {
      bind(...vs: unknown[]) {
        binds.push(vs);
        return prep;
      },
      run: vi.fn(async () => ({ success: true })),
    };
    return prep;
  });
  return { d1: { prepare }, binds, sqls, prepare };
}

describe("persistScan", () => {
  const confirmed: ConfirmedHit[] = [
    {
      packSlug: "dark-pattern/hidden-costs",
      brignullId: "hidden-costs",
      verdict: "confirmed",
      llmExplanation: "x",
      suggestedInterventions: [],
    },
    {
      packSlug: "dark-pattern/fake-scarcity",
      brignullId: "fake-scarcity",
      verdict: "uncertain", // should NOT increment aggregate
      llmExplanation: "y",
      suggestedInterventions: [],
    },
  ];

  it("is a no-op when d1 is not bound", async () => {
    await expect(persistScan(null, {
      runId: "01",
      host: "marriott.com",
      pageType: "checkout",
      hitCount: 2,
      confirmedCount: 1,
      latencyMs: 100,
      ran: "opus",
      confirmed,
      dismissed: [],
    })).resolves.toBeUndefined();
  });

  it("writes one passive_scans row + per-confirmed aggregate row", async () => {
    const s = stubD1();
    await persistScan(s.d1 as never, {
      runId: "01RUN",
      host: "marriott.com",
      pageType: "checkout",
      url: "https://marriott.com/x",
      hitCount: 2,
      confirmedCount: 1,
      latencyMs: 842,
      ran: "opus",
      userId: "user-1",
      confirmed,
      dismissed: [],
    });
    // 1 INSERT into passive_scans + 1 INSERT into passive_scan_aggregates
    // (only the 'confirmed' hit advances the aggregate; 'uncertain' is skipped).
    expect(s.sqls).toHaveLength(2);
    expect(s.sqls[0]).toContain("INSERT INTO passive_scans");
    expect(s.sqls[1]).toContain("passive_scan_aggregates");
    expect(s.binds[0]).toContain("01RUN");
    expect(s.binds[0]).toContain("marriott.com");
    expect(s.binds[0]).toContain(842);
    expect(s.binds[1]).toContain("hidden-costs");
  });

  it("doesn't throw on d1 error", async () => {
    const bad = {
      prepare: () => ({
        bind: () => ({ run: async () => { throw new Error("boom"); } }),
      }),
    };
    await expect(persistScan(bad as never, {
      runId: "01",
      host: "x.com",
      pageType: "cart",
      hitCount: 1,
      confirmedCount: 1,
      latencyMs: 10,
      ran: "opus",
      confirmed: [confirmed[0]!],
      dismissed: [],
    })).resolves.toBeUndefined();
  });
});
