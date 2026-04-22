# Pack Schema

Every Knowledge Pack in Lens is a JSON document that conforms to one of five schemas, one per pack type. This file is the canonical schema specification. See `docs/KNOWLEDGE_ARCHITECTURE.md` for the design rationale.

## Common envelope (every pack)

```jsonc
{
  "slug": "category/espresso-machines",     // stable identity
  "type": "category",                        // "category" | "dark-pattern" | "regulation" | "fee" | "intervention"
  "version": "1.0.0",                        // semver — immutable once published
  "name": "Espresso machines",               // human-readable name
  "summary": "...",                          // one-sentence description
  "status": "published",                     // "draft" | "reviewed" | "published" | "deprecated" | "retired"
  "authors": [{ "name": "Felipe Affonso", "affiliation": "..." }],
  "reviewers": [],                           // list of {name, affiliation} who reviewed
  "lastVerified": "2026-04-21",              // ISO date — last time pack was checked against primary source
  "retirementDate": null,                    // ISO date or null
  "retirementReason": null,                  // free text or null
  "evidence": [                              // every factual claim in body carries a citation
    {
      "ref": "E1",                           // short label used in the body to cite this evidence
      "claim": "ANSI/SCAA cupping standard requires brew temp 195-205°F",
      "sourceUrl": "https://sca.coffee/...",
      "retrieved": "2026-04-21",
      "primary": true                        // true = primary source; false = secondary
    }
  ],
  "applicability": { ... },                  // pack-type-specific — when this pack applies
  "body": { ... }                            // pack-type-specific payload
}
```

## Pack type: `category`

```jsonc
{
  // ... envelope ...
  "type": "category",
  "applicability": {
    "categoryAliases": ["espresso machine", "espresso", "espresso maker"],
    "productTags": ["espresso", "coffee-equipment"]
  },
  "body": {
    "criteria": [                            // default criterion template
      {
        "name": "pressure",
        "unit": "bar",
        "direction": "higher_is_better",
        "typicalRange": [9, 20],
        "notes": "9 bar is the espresso extraction standard (E1). Higher is not always better; 15 bar is the marketing target, 9 bar is the engineering target."
      }
    ],
    "specNormalization": {                   // how to parse text specs into typed values
      "pressure": { "regex": "(\\d+(?:\\.\\d+)?)\\s*bar", "unitMap": { "bar": 1.0, "PSI": 0.0689 } },
      "ram":      { "regex": "(\\d+)\\s*(?:GB|gigabyte)", "unit": "GB" }
    },
    "confabulationPatterns": [               // category-specific AI/marketing misrepresentations
      {
        "pattern": "stainless-steel build",
        "reality": "Housing is frequently plastic with only the boiler or external accent in stainless steel.",
        "verdict": "misleading",
        "checkPrompt": "Check whether the product's housing is primarily plastic or primarily stainless steel."
      }
    ],
    "counterfeitSignals": [...],             // marketplace-listing red flags specific to this category
    "compatibilityQuestions": [...],         // what existing-equipment context matters
    "typicalHiddenCosts": [                  // operating cost model
      { "name": "Replacement pods", "annualCostUsd": [80, 300], "frequency": "weekly" }
    ],
    "regulatoryLinks": ["regulation/us-federal-magnuson-moss"],  // slugs of relevant regulation packs
    "repairability": {
      "ifixitCategoryId": "espresso-machine",
      "typicalPartsAvailability": "moderate"
    }
  }
}
```

## Pack type: `dark-pattern`

```jsonc
{
  // ... envelope ...
  "type": "dark-pattern",
  "applicability": {
    "pageTypes": ["checkout", "product", "cart", "signup"],
    "urlPatterns": []                        // optional regex list
  },
  "body": {
    "canonicalName": "Hidden costs",
    "brignullId": "hidden-costs",            // Brignull canonical taxonomy id
    "description": "Costs revealed only at or near the final step of checkout...",
    "severity": "deceptive",                 // "nuisance" | "manipulative" | "deceptive" | "illegal-in-jurisdiction"
    "illegalInJurisdictions": ["us-federal-junk-fees-covered-goods"],
    "detectionHeuristics": [                 // cheap first-pass DOM/CSS signals
      {
        "kind": "dom",
        "selector": "[data-fee], .shipping-fee, .service-charge",
        "trigger": "fee_appears_after_product_added_to_cart"
      }
    ],
    "llmVerifyPrompt": "Given the cart-page content, identify whether a fee was introduced after the product was added that was not clearly and conspicuously disclosed on the product page.",
    "remediation": "Recompute the true total including all unavoidable fees (see fee/shipping pack). Flag the page as using the hidden-costs dark pattern.",
    "regulatoryLinks": ["regulation/us-federal-ftc-junk-fees"],
    "interventionLinks": ["intervention/surface-and-warn"]
  }
}
```

## Pack type: `regulation`

```jsonc
{
  // ... envelope ...
  "type": "regulation",
  "applicability": {
    "jurisdiction": "us-federal",            // or "us-state/ca", "eu", "uk", "br", etc.
    "productCategories": [],                 // [] = applies to all; otherwise specific categories
    "businessScope": {                       // who is subject to the regulation
      "appliesTo": ["live-event-tickets", "short-term-lodging"]
    }
  },
  "body": {
    "officialName": "Trade Regulation Rule on Unfair or Deceptive Fees",
    "citation": "16 CFR Part 464",
    "status": "in-force",                    // "in-force" | "delayed" | "vacated" | "superseded" | "preempted"
    "effectiveDate": "2025-05-12",
    "vacatedDate": null,
    "vacatedBy": null,
    "supersededBy": null,
    "supersedes": null,
    "scopeSummary": "Prohibits hidden and misleading fees for live-event tickets and short-term lodging.",
    "userRightsPlainLanguage": "If you're buying a live-event ticket or short-term lodging, the total price you see must include all mandatory fees from the start. Government taxes and shipping charges can be added separately. Optional ancillary services also don't need to be included.",
    "enforcementSignals": [
      { "action": "file-ftc-complaint", "url": "https://reportfraud.ftc.gov/" }
    ],
    "evidenceRefs": ["E1"]                   // references back to envelope's evidence
  }
}
```

## Pack type: `fee`

```jsonc
{
  // ... envelope ...
  "type": "fee",
  "applicability": {
    "categoryContext": [],                   // [] = applies broadly; otherwise specific
    "pageTypes": ["cart", "checkout", "product"]
  },
  "body": {
    "canonicalName": "Subscription auto-renewal",
    "description": "...",
    "typicalRange": { "min": 0, "max": null, "unit": "USD_per_period", "frequency": "monthly-or-annual" },
    "identificationSignals": [
      {
        "kind": "text-match",
        "patterns": ["auto-renew", "automatically renews", "recurring billing"],
        "caseSensitive": false
      },
      {
        "kind": "dom",
        "selector": "input[type=\"checkbox\"][name*=\"renew\"]:checked"
      }
    ],
    "disclosureLegality": [
      {
        "jurisdiction": "us-state/ca",
        "regulationSlug": "regulation/us-ca-sb-313-click-to-cancel",
        "requirement": "must be disclosed and cancellable in same channel as signup"
      }
    ],
    "negotiability": {
      "waivableOnRequest": "sometimes",
      "typicalSuccessRate": 0.6,
      "script": "Hi, I'd like to cancel auto-renewal on my subscription. Per California SB-313, I'm entitled to cancel through the same channel I signed up. Please confirm cancellation."
    },
    "interventionLinks": ["intervention/surface-and-warn"]
  }
}
```

## Pack type: `intervention`

```jsonc
{
  // ... envelope ...
  "type": "intervention",
  "applicability": {
    "triggerTypes": ["dark-pattern-detected", "user-initiated", "watcher-alert"]
  },
  "body": {
    "canonicalName": "Draft Magnuson-Moss return request",
    "description": "Draft a return/warranty-claim letter citing the Magnuson-Moss Warranty Act.",
    "executionType": "draft-and-offer",      // "surface-warn" | "refuse-redirect" | "draft-offer" | "automate-consent" | "escalate-regulator" | "community-flag"
    "consentTier": "explicit-per-action",
    "prerequisites": [
      { "kind": "within-return-window", "description": "User must be within stated return window" },
      { "kind": "product-defect-claimed", "description": "User must claim defect or warranty issue" }
    ],
    "template": {
      "format": "email",
      "subject": "Warranty claim under Magnuson-Moss Warranty Act",
      "bodyTemplate": "Dear {seller},\\n\\nI am returning/reporting a defect on {product} purchased on {date}. Under the Magnuson-Moss Warranty Act (15 U.S.C. §§ 2301-2312), I am entitled to {specific_right}. Please confirm receipt of this claim and respond within 10 business days.\\n\\n{user_name}"
    },
    "successSignals": [
      { "kind": "seller-response-received", "within": "10 business days" }
    ],
    "failureFallback": {
      "nextIntervention": "intervention/file-ftc-complaint"
    },
    "regulatoryBasis": ["regulation/us-federal-magnuson-moss"]
  }
}
```

## File naming

- Category: `packs/category/{kebab-slug}.json`
- Dark pattern: `packs/dark-pattern/{kebab-slug}.json`
- Regulation: `packs/regulation/{jurisdiction}-{kebab-slug}.json`
- Fee: `packs/fee/{kebab-slug}.json`
- Intervention: `packs/intervention/{kebab-slug}.json`

The filename MUST match the pack's `slug` field (minus the type prefix). Validator enforces this.
