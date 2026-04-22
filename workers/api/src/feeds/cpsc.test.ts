import { describe, expect, it } from "vitest";
import { parseCpscRss, parseCpscTitle } from "./cpsc.js";

describe("parseCpscTitle", () => {
  it("parses classic CPSC headline", () => {
    const r = parseCpscTitle("Roborock Recalls S8 Pro Ultra Robot Vacuums Due to Fire Hazard");
    expect(r.brand).toBe("Roborock");
    expect(r.productNames[0]).toContain("S8 Pro Ultra");
    expect(r.hazard).toMatch(/fire/i);
  });

  it("parses 'Due to Risk of' variant", () => {
    const r = parseCpscTitle(
      "Fisher-Price Recalls Rock 'n Glide Soothers Due to Risk of Suffocation",
    );
    expect(r.brand).toBe("Fisher-Price");
    expect(r.hazard).toMatch(/suffocation/i);
  });

  it("falls back to first brand-like token when format deviates", () => {
    const r = parseCpscTitle("Apple Inc Notice of Recall 2026-04-01");
    expect(r.brand.length).toBeGreaterThan(0);
  });
});

describe("parseCpscRss", () => {
  const RSS_SAMPLE = `<?xml version="1.0"?>
  <rss version="2.0"><channel>
    <item>
      <title><![CDATA[Roborock Recalls S8 Pro Ultra Robot Vacuums Due to Fire Hazard]]></title>
      <link>https://www.cpsc.gov/Recalls/2026/Roborock-Recalls-S8-Pro-Ultra</link>
      <description><![CDATA[<p>Remedy: Consumers should immediately stop using the recalled robots and contact Roborock for a full refund. The fire hazard involves...</p>]]></description>
      <pubDate>Wed, 22 Apr 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title><![CDATA[Fisher-Price Recalls Rock 'n Glide Soothers Due to Risk of Suffocation]]></title>
      <link>https://www.cpsc.gov/Recalls/2026/Fisher-Price-Rock-n-Glide</link>
      <description>Consumers should immediately stop using the product.</description>
      <pubDate>Tue, 21 Apr 2026 12:00:00 GMT</pubDate>
    </item>
  </channel></rss>`;

  it("extracts 2 items from a 2-item feed", () => {
    const items = parseCpscRss(RSS_SAMPLE);
    expect(items).toHaveLength(2);
    expect(items[0]!.brand).toBe("Roborock");
    expect(items[1]!.brand).toBe("Fisher-Price");
  });

  it("normalizes publishedAt to ISO", () => {
    const items = parseCpscRss(RSS_SAMPLE);
    expect(new Date(items[0]!.publishedAt).toISOString()).toBe(items[0]!.publishedAt);
  });

  it("builds source-prefixed recallId", () => {
    const items = parseCpscRss(RSS_SAMPLE);
    expect(items[0]!.recallId.startsWith("cpsc:")).toBe(true);
  });

  it("extracts remedy when present", () => {
    const items = parseCpscRss(RSS_SAMPLE);
    expect(items[0]!.remedyText.toLowerCase()).toContain("contact roborock");
  });

  it("handles Atom-style entries", () => {
    const atom = `<?xml version="1.0"?>
    <feed><entry>
      <title>Apple Recalls iPhone 15 Pro Battery Modules Due to Overheating</title>
      <link>https://www.cpsc.gov/Recalls/2026/Apple-iPhone-15-Pro-Battery</link>
      <summary>Consumers should stop using the recalled batteries.</summary>
      <published>2026-03-15T12:00:00Z</published>
    </entry></feed>`;
    const items = parseCpscRss(atom);
    expect(items).toHaveLength(1);
    expect(items[0]!.brand).toBe("Apple");
  });

  it("returns empty array on malformed input", () => {
    expect(parseCpscRss("")).toEqual([]);
    expect(parseCpscRss("<rss></rss>")).toEqual([]);
  });
});
