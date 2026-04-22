// S4-W27 — fixture-backed domain-age lookup.
// Real WHOIS integration is a follow-up block (requires a paid API). v1 ships
// a fixture map with well-known established domains + a "brand-new-shop-*"
// family for testing the recent-domain fail path.

interface DomainRecord {
  registeredAt: string; // ISO date
  note?: string;
}

const FIXTURES: Record<string, DomainRecord> = {
  "amazon.com": { registeredAt: "1994-11-01" },
  "walmart.com": { registeredAt: "1995-02-01" },
  "target.com": { registeredAt: "1994-02-01" },
  "bestbuy.com": { registeredAt: "1994-06-01" },
  "costco.com": { registeredAt: "1995-08-01" },
  "homedepot.com": { registeredAt: "1995-02-01" },
  "ebay.com": { registeredAt: "1995-09-01" },
  "etsy.com": { registeredAt: "2005-05-01" },
  "shopify.com": { registeredAt: "2004-08-01" },
  "apple.com": { registeredAt: "1987-02-01" },
  "paypal.com": { registeredAt: "1998-07-01" },
  "nike.com": { registeredAt: "1994-03-01" },

  // Synthetic "suspicious" fixtures for testing the recent-domain fail path.
  "brand-new-shop-2026.example": { registeredAt: "2026-04-10", note: "fixture" },
  // suspicious-deals.test: 10 days old at test NOW=2026-04-22 → very-recent.
  "suspicious-deals.test": { registeredAt: "2026-04-12", note: "fixture" },
  "amaz0n-deals.com": { registeredAt: "2026-04-01", note: "fixture" },
};

export interface DomainAgeLookup {
  status: "known-old" | "known-recent" | "known-very-recent" | "unknown";
  daysSinceRegistered: number | null;
  registeredAt?: string;
}

const MS_DAY = 86_400_000;

export function lookupDomainAge(host: string, now: Date = new Date()): DomainAgeLookup {
  const canonical = host.toLowerCase().replace(/^www\./, "");
  const record = FIXTURES[canonical];
  if (!record) return { status: "unknown", daysSinceRegistered: null };
  const registered = new Date(record.registeredAt);
  if (Number.isNaN(registered.getTime())) {
    return { status: "unknown", daysSinceRegistered: null, registeredAt: record.registeredAt };
  }
  const days = Math.floor((now.getTime() - registered.getTime()) / MS_DAY);
  let status: DomainAgeLookup["status"];
  if (days < 30) status = "known-very-recent";
  else if (days < 90) status = "known-recent";
  else status = "known-old";
  return { status, daysSinceRegistered: days, registeredAt: record.registeredAt };
}
