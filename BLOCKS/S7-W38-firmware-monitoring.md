# S7-W38 — Firmware / CVE monitoring for connected-device purchases

**Depends on:** F2 ✅ (purchases + interventions), F4 ✅ (cron), S6-W33 ✅ (pattern: feed → matcher → intervention).

**Goal:** Once a user has bought a connected device (router, camera, doorbell, smart lock, thermostat, hub, printer, access point), Lens watches manufacturer security bulletins + CVE entries keyed to that device and pings them when a firmware update carries a security fix worth applying. This is the "Sarah's router got a critical CVE three months after she bought it" background-mode moment in `VISION_COMPLETE.md` §4 (touchpoint 28) — the second watcher workflow after S6-W33 recall-watch.

`BLOCK_PLAN.md` says:

> `firmware.watch`. Cron weekly per connected-device purchase. Checks manufacturer security bulletins + CVE feeds.
> Surfaces: dashboard + email.
> Acceptance: test with a known-patched device → correct alert.

## Why the block matters

Recalls are rare and dramatic (physical-world hazards). Firmware advisories are quiet and frequent — the average connected home has 7-15 devices, each of which ships a few bulletins a year, and most users never see them. Auto-update is spotty. Lens being the thing that sits between the manufacturer's PSIRT page and the user is a load-bearing ambient-mode beat.

## Architecture

Mirrors S6-W33 end-to-end. Four stages, run weekly on cron + on-demand via HTTP:

```
cron 06:13 Mon UTC    or   POST /firmware/scan { purchaseIds? }
         │
         ├─ fetch manufacturer bulletins (ASUS / Netgear / TP-Link / Ubiquiti / Nest / Ring / eufy / Philips Hue / HP / Brother / Synology / Bosch) — fixture-backed, LENS_FIRMWARE_MODE = "fixture" by default
         ├─ fetch NVD CVE JSON feed (fixture-backed same)
         └─ normalize → FirmwareAdvisory[]
               │
               ▼
         match against connected-device purchases (category allowlist + brand/model tokens)
               │
               ▼
         assess each match → severity band (critical/high/medium/info) from CVSS
               │
               ▼
         for every critical/high match: write intervention (pack: advisory/apply-firmware-update)
         for every medium: surface as dashboard card but no email
         aggregate run telemetry
```

### Connected-device category allowlist

Only these category slugs get scanned (keeps the matcher tight — a toaster purchase never triggers a firmware match):

```
routers, wireless-access-points, mesh-wifi, network-switches,
security-cameras, doorbells, smart-locks, smart-thermostats,
smart-hubs, smart-lights, smart-plugs, smart-speakers,
printers, nas, home-network, ip-cameras, baby-monitors
```

Free-text `category = null` rows fall through via a substring check on the product name (matches tokens like "router", "camera", "lock", "thermostat", "doorbell", "hub", "access point", "printer", "NAS").

### FirmwareAdvisory normalization

```ts
interface FirmwareAdvisory {
  source: "manufacturer" | "nvd";
  advisoryId: string;        // e.g. "ASUS-SA-2025-07", "CVE-2025-12345"
  vendor: string;            // canonical — e.g. "ASUS", "TP-Link"
  affectedModels: string[];  // ["RT-AX88U", "RT-AX86U"]
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "informational";
  cvssScore: number | null;  // 0-10
  cveIds: string[];          // one advisory may reference multiple CVEs
  fixedFirmwareVersion: string | null;
  remediationSteps: string;  // plain-English "how to update"
  publishedAt: string;       // ISO
  sourceUrl: string;
}
```

### Matcher scoring

```
Brand/vendor match on purchase.brand token overlap ≥ 0.5 → +0.40
Product-model token overlap ≥ 0.5 with any affectedModel → +0.40
Advisory published AFTER purchase date AND within 5 years → +0.20
Category in the connected-device allowlist (or free-text hit on product name) → gate (all 0 if fails)
THRESHOLD: score ≥ 0.70 emits a match (same as S6-W33)
```

### Severity banding

| Raw CVSS | Band | Notification surface |
|----------|------|---------------------|
| ≥ 9.0 | critical | push + email + dashboard + intervention written |
| 7.0-8.9 | high | email + dashboard + intervention written |
| 4.0-6.9 | medium | dashboard card only |
| < 4.0 | low | dashboard card, dismissible + auto-suppressed after 30d |
| no CVSS | informational | same as medium |

The pack `advisory/apply-firmware-update` (already shipped in `packs/`) holds the generic remediation guidance. Per-advisory `remediationSteps` from the bulletin is spliced into the intervention payload.

### Fixture dataset

15+ real-shape advisories to cover the matrix:

1. ASUS-SA-2025-07 — RT-AX88U stack overflow (CVSS 9.8, critical)
2. Netgear PSV-2025-0123 — Nighthawk R7000 auth bypass (7.5, high)
3. TP-Link TL-WR841N buffer overrun (8.1, high)
4. Ubiquiti USW-24 privilege escalation (7.2, high)
5. Nest Cam Outdoor MITM (4.6, medium)
6. Ring Doorbell 2nd-gen info-leak (3.1, low)
7. eufy Camera unauth-video-access (9.1, critical)
8. Philips Hue Bridge command injection (7.8, high)
9. HP LaserJet Pro PIN bypass (5.3, medium)
10. Brother HL-L2350DW SMB auth (7.6, high)
11. Synology DSM critical RCE (9.9, critical)
12. Bosch thermostat denial-of-service (5.2, medium)
13. CVE-2025-12345 (NVD) — Mikrotik RouterOS 6.x (8.8, high)
14. CVE-2024-55512 (NVD) — D-Link DIR-825 (7.4, high)
15. CVE-2025-99999 (NVD) — generic IP camera firmware (6.5, medium)

Plus 3 negative-control entries: product user doesn't own, pre-purchase bulletin, non-connected-device purchase (a blender).

## HTTP contract

### POST /firmware/scan

Auth required. Body:

```json
{
  "purchaseIds": ["p1","p2"] // optional — restrict to specific purchases
}
```

Response:

```json
{
  "ok": true,
  "scanned": 7,
  "matched": 2,
  "critical": 1,
  "high": 1,
  "medium": 0,
  "interventions": [
    {
      "interventionId": "01J...",
      "purchaseId": "p-router-1",
      "advisoryId": "ASUS-SA-2025-07",
      "vendor": "ASUS",
      "severity": "critical",
      "cvssScore": 9.8,
      "fixedFirmwareVersion": "3.0.0.4.388_24400",
      "title": "RT-AX88U HTTPD stack overflow",
      "remediationSteps": "Log in to the router admin ... apply firmware 3.0.0.4.388_24400",
      "publishedAt": "2025-07-15",
      "sourceUrl": "https://www.asus.com/..."
    }
  ],
  "generatedAt": "2026-04-22T04:00:00Z",
  "elapsedMs": 18
}
```

### Weekly cron

The existing `wrangler.toml` already has the weekly trigger `13 6 * * 1` (Monday 06:13 UTC). Hook into that via `workers/api/src/firmware/cron.ts` — iterates every user, runs the scan, writes interventions, emits `firmware.scan.done` events.

## Apple-product bar hooks

| § | Rule | How S7-W38 meets it |
|---|---|---|
| 2 intelligent | inputs anticipate intent | matcher only fires inside the connected-device allowlist; never a firmware-update alert on a toaster |
| 4 background mode rules (AMBIENT_MODEL §4) | background actions explain + offer action + dismiss | every intervention carries the advisory title + CVSS + remediation + source URL |
| 9 honest loading | `scanned / matched / critical / high / medium` counts in response |
| 10 never a placeholder | no matches → `matched: 0, interventions: []` with clear counts, not a silent dummy alert |

## Files touched

- `workers/api/src/firmware/types.ts` (new)
- `workers/api/src/firmware/fixtures.ts` (new) — 15+ fixture advisories
- `workers/api/src/firmware/source.ts` (new) — `fetchAdvisories` with fixture-mode + scaffold for live
- `workers/api/src/firmware/matcher.ts` (new) — scoring + threshold
- `workers/api/src/firmware/assess.ts` (new) — severity banding
- `workers/api/src/firmware/handler.ts` (new) — POST /firmware/scan
- `workers/api/src/firmware/cron.ts` (new) — per-user iterator + runForUser
- `workers/api/src/firmware/*.test.ts` (new)
- `workers/api/src/cron/dispatcher.ts` (modified) — wire S7-W38 weekly trigger to firmware.scan
- `workers/api/src/index.ts` (modified) — wire route
- `CHECKLIST.md` (modified)

## Acceptance criteria

- `fetchAdvisories` returns the 15+ fixture advisories in fixture mode.
- Matcher correctly matches:
  - ASUS RT-AX88U purchase → ASUS-SA-2025-07 advisory (score ≥ 0.7).
  - eufy camera purchase → eufy advisory.
  - D-Link DIR-825 purchase → CVE-2024-55512.
  - Does NOT match: a blender purchase (category allowlist miss), a purchase 6 years older than the advisory (recency gate fails).
- Severity banding: CVSS 9.8 → critical, 7.5 → high, 4.6 → medium, 3.1 → low.
- POST /firmware/scan with 503/401/400/200 all wired.
- Critical/high matches write interventions with status="drafted", pack slug "advisory/apply-firmware-update" (or fall back to a generic slug if the pack isn't in the registry), related_purchase_id linked.
- Weekly cron dispatcher includes firmware scan.
- Tests: ≥ 25 across matcher + assess + handler + cron.
- Typecheck + full suite green.
- Deployed; `/firmware/scan` unauth → 401 (proves route live).
- Commit + CHECKLIST ✅.

## Implementation checklist

1. Write `types.ts` with the FirmwareAdvisory + PurchaseLike + MatchResult + AssessedMatch types.
2. Write `fixtures.ts` with 15+ advisories + 3 negative controls.
3. Write `source.ts` with `fetchAdvisories(env)` — fixture mode via `LENS_FIRMWARE_MODE === "fixture"` (default); live scaffold returns empty for now with a log.
4. Write `matcher.ts` — category allowlist + free-text fallback + scoring + threshold 0.7.
5. Write `assess.ts` — severity banding + intervention-worthy helper.
6. Write `handler.ts` — POST /firmware/scan with full auth + validation + write interventions for critical/high.
7. Write `cron.ts` — `runForUser(userId, d1, env)` + skeleton iterator.
8. Wire `/firmware/scan` in `src/index.ts`.
9. Wire S7-W38 weekly trigger in `workers/api/src/cron/dispatcher.ts` if it exists, else hook into the `scheduled` export. If the dispatcher pattern doesn't exist, just add an exported function for future integration and test that it works.
10. Write tests: matcher (≥8 cases incl. negative controls), assess (each band), handler (503/401/400/200 + matches surface + interventions written), cron-runner (runForUser returns expected counts).
11. Typecheck + full vitest.
12. Deploy.
13. Smoke.
14. Commit `lens(S7-W38): firmware monitoring + connected-device CVE watcher`.
15. CHECKLIST ✅ + progress log + push.
