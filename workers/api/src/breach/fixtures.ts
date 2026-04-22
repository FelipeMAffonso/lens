// S4-W26 — fixture breach dataset: 15 best-documented consumer-facing breaches
// of the last decade + change. Every entry carries a press-report pointer in
// the code comment. Expandable via PR. Severity derived from (records × data
// sensitivity); adjust only with citation.

import type { BreachRecord } from "./types.js";

export const BREACH_FIXTURES: BreachRecord[] = [
  // Target 2013: 40M payment-card records + 70M customer records. Source:
  // nytimes.com/2014/01/11/business/target-breach-affected-70-million-customers.html
  {
    id: "target-2013",
    host: "target.com",
    date: "2013-12-19",
    recordsExposed: 40_000_000,
    dataTypes: ["card", "name", "address"],
    severity: "critical",
    source: "fixture",
    summary:
      "Target confirmed 40M payment-card records + 70M customer contact records exfiltrated via BlackPOS malware installed through an HVAC-contractor credential.",
  },
  // Home Depot 2014: 56M payment cards. Source: krebsonsecurity.com
  {
    id: "homedepot-2014",
    host: "homedepot.com",
    date: "2014-09-18",
    recordsExposed: 56_000_000,
    dataTypes: ["card", "email"],
    severity: "critical",
    source: "fixture",
    summary: "Home Depot confirmed ~56M payment-card records exfiltrated via a custom BlackPOS variant.",
  },
  // Equifax 2017: 147M. Source: ftc.gov/enforcement/refunds/equifax-data-breach-settlement
  {
    id: "equifax-2017",
    host: "equifax.com",
    date: "2017-09-07",
    recordsExposed: 147_000_000,
    dataTypes: ["ssn", "name", "dob", "address", "driver-license"],
    severity: "critical",
    source: "fixture",
    summary:
      "Equifax exposed ~147M US consumers' SSNs + DOBs + addresses via an unpatched Apache Struts vulnerability.",
  },
  // Yahoo 2013-14: 3B accounts. Source: oath.com/press/yahoo-provides-notice...
  {
    id: "yahoo-2013",
    host: "yahoo.com",
    date: "2013-08-01",
    recordsExposed: 3_000_000_000,
    dataTypes: ["email", "password", "security-question"],
    severity: "critical",
    source: "fixture",
    summary: "Yahoo disclosed a 2013 breach affecting all 3B accounts, including names, emails, hashed passwords, and security questions.",
  },
  // Marriott / Starwood 2018: 500M. Source: help.marriott.com/security
  {
    id: "marriott-2018",
    host: "marriott.com",
    date: "2018-11-30",
    recordsExposed: 500_000_000,
    dataTypes: ["name", "email", "passport", "card", "address"],
    severity: "critical",
    source: "fixture",
    summary:
      "Marriott disclosed unauthorized access to the Starwood reservation database dating back to 2014; ~500M guest records including passport numbers.",
  },
  // Capital One 2019: 106M. Source: doj.gov Capital One indictment
  {
    id: "capitalone-2019",
    host: "capitalone.com",
    date: "2019-07-29",
    recordsExposed: 106_000_000,
    dataTypes: ["ssn", "bank-account", "name", "address"],
    severity: "critical",
    source: "fixture",
    summary:
      "Capital One disclosed a 2019 breach where a former AWS engineer accessed 106M credit-card applications, including ~140K SSNs and 80K bank-account numbers.",
  },
  // T-Mobile 2021: 50M. Source: t-mobile.com/news/network/cyberattack-against-tmobile
  {
    id: "tmobile-2021",
    host: "t-mobile.com",
    date: "2021-08-17",
    recordsExposed: 50_000_000,
    dataTypes: ["ssn", "name", "dob", "driver-license"],
    severity: "critical",
    source: "fixture",
    summary: "T-Mobile confirmed 50M customer records (including SSNs + driver-license numbers) exfiltrated.",
  },
  // T-Mobile 2023: 37M via API abuse. Source: sec.gov 8-K filing 2023-01-19
  {
    id: "tmobile-2023",
    host: "t-mobile.com",
    date: "2023-01-19",
    recordsExposed: 37_000_000,
    dataTypes: ["name", "email", "dob", "phone"],
    severity: "high",
    source: "fixture",
    summary: "T-Mobile disclosed 37M customer accounts exposed via an unprotected API endpoint.",
  },
  // LastPass 2022. Source: blog.lastpass.com notice-of-recent-security-incident
  {
    id: "lastpass-2022",
    host: "lastpass.com",
    date: "2022-12-22",
    recordsExposed: 25_000_000,
    dataTypes: ["vault-blob", "email", "url"],
    severity: "critical",
    source: "fixture",
    summary:
      "LastPass confirmed attackers exfiltrated customer vault backups (encrypted, but retrievable offline) along with associated emails + URLs.",
  },
  // Facebook 2019: 533M scraped phone+ID via the Contact Importer bug.
  {
    id: "facebook-2019",
    host: "facebook.com",
    date: "2019-09-01",
    recordsExposed: 533_000_000,
    dataTypes: ["phone", "email", "name", "dob"],
    severity: "high",
    source: "fixture",
    summary: "533M Facebook user records (phones + DOBs + emails) scraped via Contact Importer and later leaked publicly.",
  },
  // Okta 2022: ~366 customer tenants impacted. Source: okta.com/blog/2022/03...
  {
    id: "okta-2022",
    host: "okta.com",
    date: "2022-01-17",
    recordsExposed: 366,
    dataTypes: ["customer-tenant"],
    severity: "moderate",
    source: "fixture",
    summary: "Okta disclosed that a contractor's laptop compromise exposed 366 customer tenants to reconnaissance activity.",
  },
  // Uber 2016: 57M records. Source: ftc.gov/enforcement/cases-proceedings/152-3054/uber-technologies
  {
    id: "uber-2016",
    host: "uber.com",
    date: "2016-10-01",
    recordsExposed: 57_000_000,
    dataTypes: ["name", "email", "phone", "driver-license"],
    severity: "high",
    source: "fixture",
    summary: "Uber paid attackers to delete stolen data covering 57M riders + drivers (including 600K US driver-license numbers).",
  },
  // Dropbox 2012: 68M hashed creds. Source: dropbox.com/help/security
  {
    id: "dropbox-2012",
    host: "dropbox.com",
    date: "2012-07-01",
    recordsExposed: 68_000_000,
    dataTypes: ["email", "password"],
    severity: "moderate",
    source: "fixture",
    summary:
      "Dropbox confirmed ~68M email+hashed-password pairs exfiltrated; credential set later surfaced publicly in 2016.",
  },
  // Adobe 2013: 153M records. Source: adobe.com/corporate-responsibility/security/incident-response.html
  {
    id: "adobe-2013",
    host: "adobe.com",
    date: "2013-10-03",
    recordsExposed: 153_000_000,
    dataTypes: ["email", "password", "card"],
    severity: "high",
    source: "fixture",
    summary:
      "Adobe confirmed ~153M customer records (including encrypted payment cards) exfiltrated from a password-hashing table with weak key reuse.",
  },
  // Anthem 2015: 78M. Source: anthemfacts.com
  {
    id: "anthem-2015",
    host: "anthem.com",
    date: "2015-02-04",
    recordsExposed: 78_800_000,
    dataTypes: ["ssn", "name", "dob", "address", "medical-id"],
    severity: "critical",
    source: "fixture",
    summary: "Anthem disclosed 78.8M records including SSNs + medical IDs exfiltrated through a phishing-to-privileged-account compromise.",
  },
];

/** Canonicalize `www.foo.com` → `foo.com`. Lowercase. */
export function canonicalHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

export function breachesForHost(host: string): BreachRecord[] {
  const c = canonicalHost(host);
  return BREACH_FIXTURES.filter((b) => canonicalHost(b.host) === c);
}
