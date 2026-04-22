import { describe, expect, it } from "vitest";
import { aggregateBreaches, bandFor, computeScore } from "./score.js";
import type { BreachRecord } from "./types.js";

const NOW = new Date("2026-04-22T00:00:00Z");

function b(over: Partial<BreachRecord>): BreachRecord {
  return {
    id: "x",
    host: "x.com",
    date: "2025-01-01",
    recordsExposed: 1000,
    dataTypes: ["email"],
    severity: "low",
    source: "fixture",
    summary: "",
    ...over,
  };
}

describe("aggregateBreaches", () => {
  it("counts breaches within 5yr + 10yr windows", () => {
    const r = aggregateBreaches({
      breaches: [
        b({ date: "2025-06-01" }), // 0.9yr
        b({ date: "2022-06-01" }), // 3.9yr
        b({ date: "2018-06-01" }), // 7.9yr
        b({ date: "2013-06-01" }), // 12.8yr
      ],
      now: NOW,
    });
    expect(r.count5yr).toBe(2);
    expect(r.count10yr).toBe(3);
  });

  it("captures total records + most-recent date + years-since", () => {
    const r = aggregateBreaches({
      breaches: [
        b({ date: "2020-01-01", recordsExposed: 1_000_000 }),
        b({ date: "2024-06-01", recordsExposed: 500_000 }),
      ],
      now: NOW,
    });
    expect(r.totalRecordsExposed).toBe(1_500_000);
    expect(r.mostRecentDate).toBe("2024-06-01");
    expect(r.yearsSinceMostRecent).toBeGreaterThan(1);
    expect(r.yearsSinceMostRecent).toBeLessThan(2);
  });

  it("flags ssn/card/password data-type exposure", () => {
    const r = aggregateBreaches({
      breaches: [
        b({ dataTypes: ["ssn", "name"] }),
        b({ dataTypes: ["card"] }),
        b({ dataTypes: ["password"] }),
      ],
      now: NOW,
    });
    expect(r.hasSsnExposure).toBe(true);
    expect(r.hasCardExposure).toBe(true);
    expect(r.hasPasswordExposure).toBe(true);
  });

  it("empty → zero aggregate", () => {
    const r = aggregateBreaches({ breaches: [], now: NOW });
    expect(r.count5yr).toBe(0);
    expect(r.mostRecentDate).toBeNull();
    expect(r.yearsSinceMostRecent).toBeNull();
  });
});

describe("computeScore", () => {
  it("critical breach within 2yr scores ~25", () => {
    const score = computeScore(
      [b({ severity: "critical", date: "2024-06-01" })],
      NOW,
    );
    // 25 * 1.0 recency = 25
    expect(score).toBe(25);
  });

  it("critical breach 3yr ago scores ~17.5 (0.7 multiplier)", () => {
    const score = computeScore(
      [b({ severity: "critical", date: "2023-04-22" })],
      NOW,
    );
    expect(score).toBeGreaterThanOrEqual(17);
    expect(score).toBeLessThanOrEqual(18);
  });

  it("adds SSN bonus when breach < 5yr + includes SSN", () => {
    const score = computeScore(
      [b({ severity: "high", date: "2024-06-01", dataTypes: ["ssn", "name"] })],
      NOW,
    );
    // 15 * 1.0 + 15 = 30
    expect(score).toBe(30);
  });

  it("> 10yr breaches contribute 0", () => {
    const score = computeScore(
      [b({ severity: "critical", date: "2013-01-01" })],
      NOW,
    );
    expect(score).toBe(0);
  });

  it("empty breaches → 0", () => {
    expect(computeScore([], NOW)).toBe(0);
  });

  it("clamps to 100", () => {
    const many: BreachRecord[] = [];
    for (let i = 0; i < 10; i++) {
      many.push(b({ severity: "critical", date: "2024-01-01", dataTypes: ["ssn", "card", "password"] }));
    }
    expect(computeScore(many, NOW)).toBe(100);
  });
});

describe("bandFor", () => {
  it("none → low → moderate → high → critical", () => {
    expect(bandFor(0)).toBe("none");
    expect(bandFor(10)).toBe("low");
    expect(bandFor(25)).toBe("moderate");
    expect(bandFor(50)).toBe("high");
    expect(bandFor(80)).toBe("critical");
  });
});
