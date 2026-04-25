import { afterEach, describe, expect, it, vi } from "vitest";
import { extractIntentAndRecommendation } from "./extract.js";
import type { Env } from "./index.js";

describe("extractIntentAndRecommendation URL mode", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uses Jina for Amazon URLs, cleans affiliate tags, and derives useful charger criteria", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(
        `
Title: Anker MagGo 3-in-1 Foldable Charging Station - Amazon.com
URL Source: https://www.amazon.com/dp/B0G1MRLXMV
Markdown Content:
# Anker MagGo 3-in-1 Foldable Charging Station

With Deal: $79.99
List Price: $109.99

4.6 out of 5 stars
12,345 ratings

- Foldable wireless charging station for iPhone, Apple Watch, and AirPods
- Qi2-certified 15W fast wireless charging
- ActiveShield temperature monitoring for safe charging
`,
        { status: 200, headers: { "content-type": "text/markdown" } },
      );
    }) as typeof fetch;

    const out = await extractIntentAndRecommendation(
      {
        kind: "url",
        url: "https://www.amazon.com/Anker-Charging-Foldable/dp/B0G1MRLXMV/ref=sr_1_3?tag=evil-20&linkCode=ll1&utm_source=x",
        userPrompt: "I need a compact travel charger under $100 that works with iPhone, Apple Watch, and AirPods.",
      },
      {} as Env,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("https://r.jina.ai/");
    expect(out.intent.category).toBe("wireless chargers");
    expect(out.intent.budget?.max).toBe(100);
    expect(out.intent.criteria.map((c) => c.name)).toEqual(
      expect.arrayContaining(["device_compatibility", "portability", "price"]),
    );
    expect(out.aiRecommendation.pickedProduct.name).toContain("Anker MagGo");
    expect(out.aiRecommendation.pickedProduct.price).toBe(79.99);
    expect(out.aiRecommendation.pickedProduct.url).toBe("https://amazon.com/dp/B0G1MRLXMV");
    expect(out.aiRecommendation.sourceUrl).toBe("https://amazon.com/dp/B0G1MRLXMV");
    expect(JSON.stringify(out.aiRecommendation)).not.toMatch(/tag=|linkCode|utm_/i);
    expect(out.aiRecommendation.claims.some((c) => c.attribute === "price")).toBe(true);
  });
});
