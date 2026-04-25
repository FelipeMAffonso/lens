import type { UserIntent } from "@lens/shared";

type Criterion = UserIntent["criteria"][number];
type CriterionDirection = Criterion["direction"];
type CriterionSource = NonNullable<Criterion["source"]>;

export interface PreferenceInferenceOptions {
  prompt?: string | undefined;
  mode?: "query" | "text" | "image" | "url" | "photo" | "api" | undefined;
  profileApplied?: boolean | undefined;
  revealedSignals?: number | undefined;
  revealedConsent?: boolean | undefined;
  localOnly?: boolean | undefined;
}

interface PriorCriterion {
  name: string;
  direction: CriterionDirection;
  weight: number;
  rationale: string;
}

const PRICE_ALIASES = new Set(["price", "cost", "budget", "affordability", "total_cost"]);

const CATEGORY_PRIORS: Array<[RegExp, PriorCriterion[]]> = [
  [
    /\b(wireless_?charg(?:er|ing)?s?|charg(?:er|ing)s?|charging_station|magsafe|qi2?|power_bank)\b/i,
    [
      { name: "charging_performance", direction: "higher_is_better", weight: 0.16, rationale: "Chargers differ materially on wattage, heat, and charging reliability." },
      { name: "device_compatibility", direction: "higher_is_better", weight: 0.14, rationale: "A charger is only useful if it fits the user's devices." },
      { name: "safety", direction: "higher_is_better", weight: 0.10, rationale: "Power accessories need basic thermal and certification scrutiny." },
      { name: "portability", direction: "higher_is_better", weight: 0.08, rationale: "Foldable and compact designs matter for charger use cases." },
    ],
  ],
  [
    /\b(laptop|notebook|macbook|thinkpad)\b/i,
    [
      { name: "performance", direction: "higher_is_better", weight: 0.15, rationale: "Computers are multi-attribute tools, so raw performance is a common baseline." },
      { name: "battery_life", direction: "higher_is_better", weight: 0.13, rationale: "Portable computers impose a battery tradeoff even when not stated." },
      { name: "portability", direction: "higher_is_better", weight: 0.10, rationale: "Weight and size often determine real daily utility." },
      { name: "repairability", direction: "higher_is_better", weight: 0.08, rationale: "Repairability reduces long-run ownership cost and lock-in." },
    ],
  ],
  [
    /\b(headphones?|earbuds?|in_?ears?)\b/i,
    [
      { name: "noise_cancellation", direction: "higher_is_better", weight: 0.14, rationale: "Noise control is a major differentiator in this category." },
      { name: "battery_life", direction: "higher_is_better", weight: 0.12, rationale: "Battery life determines daily convenience for wireless audio." },
      { name: "comfort", direction: "higher_is_better", weight: 0.12, rationale: "Audio products can fail despite good specs if they are uncomfortable." },
      { name: "audio_quality", direction: "higher_is_better", weight: 0.12, rationale: "Sound quality remains the core category utility." },
    ],
  ],
  [
    /\b(espresso|coffee_machine|coffee_maker)\b/i,
    [
      { name: "pressure", direction: "higher_is_better", weight: 0.12, rationale: "Pressure is a frequent claim in espresso recommendations and needs context." },
      { name: "build_quality", direction: "higher_is_better", weight: 0.12, rationale: "Materials and serviceability affect long-run value." },
      { name: "repairability", direction: "higher_is_better", weight: 0.08, rationale: "Appliances create avoidable welfare loss when parts or repair paths are poor." },
      { name: "warranty", direction: "higher_is_better", weight: 0.07, rationale: "Warranty terms matter for countertop appliances." },
    ],
  ],
  [
    /\b(phone|smartphone|iphone|android)\b/i,
    [
      { name: "software_support_years", direction: "higher_is_better", weight: 0.14, rationale: "Phones lose value when updates and security patches stop." },
      { name: "battery_life", direction: "higher_is_better", weight: 0.12, rationale: "Battery endurance is a major hidden daily cost." },
      { name: "camera_quality", direction: "higher_is_better", weight: 0.10, rationale: "Camera quality often drives phone satisfaction." },
      { name: "privacy", direction: "higher_is_better", weight: 0.08, rationale: "Phones are high-sensitivity data devices." },
    ],
  ],
  [
    /\b(office_chair|ergonomic_chair|chair)\b/i,
    [
      { name: "ergonomics", direction: "higher_is_better", weight: 0.16, rationale: "The core welfare question is whether the chair supports sustained use." },
      { name: "adjustability", direction: "higher_is_better", weight: 0.12, rationale: "Adjustability determines fit across body types." },
      { name: "durability", direction: "higher_is_better", weight: 0.10, rationale: "Durability controls long-run cost." },
      { name: "warranty", direction: "higher_is_better", weight: 0.07, rationale: "Warranty is a useful quality signal in furniture." },
    ],
  ],
  [
    /\b(mattress|bed_in_a_box)\b/i,
    [
      { name: "comfort", direction: "higher_is_better", weight: 0.16, rationale: "Comfort is the direct utility dimension for mattresses." },
      { name: "return_window", direction: "higher_is_better", weight: 0.10, rationale: "Fit is uncertain, so a real return window protects the consumer." },
      { name: "material_safety", direction: "higher_is_better", weight: 0.08, rationale: "Materials and certifications matter for close-contact products." },
      { name: "durability", direction: "higher_is_better", weight: 0.08, rationale: "Sagging and early wear create hidden replacement cost." },
    ],
  ],
  [
    /\b(air_purifier|hepa)\b/i,
    [
      { name: "cadr", direction: "higher_is_better", weight: 0.15, rationale: "Clean-air delivery rate is the core measurable performance signal." },
      { name: "noise", direction: "lower_is_better", weight: 0.11, rationale: "Noise determines whether users actually run the unit." },
      { name: "filter_cost", direction: "lower_is_better", weight: 0.10, rationale: "Replacement filters are a recurring hidden cost." },
      { name: "energy_efficiency", direction: "higher_is_better", weight: 0.08, rationale: "Air purifiers run for long periods, so energy draw matters." },
    ],
  ],
  [
    /\b(baby|infant|toddler|car_?seat|stroller|crib|high_?chair)\b/i,
    [
      { name: "safety", direction: "higher_is_better", weight: 0.18, rationale: "Child products need safety and certification scrutiny before ordinary convenience tradeoffs." },
      { name: "recall_history", direction: "lower_is_better", weight: 0.12, rationale: "Past recalls and incident reports are a direct consumer-welfare signal." },
      { name: "fit_compatibility", direction: "higher_is_better", weight: 0.10, rationale: "Car seats, strollers, and cribs can be unsafe or useless when they do not fit the child, car, or home." },
      { name: "ease_of_cleaning", direction: "higher_is_better", weight: 0.07, rationale: "Cleaning friction materially affects real-world use for child products." },
    ],
  ],
  [
    /\b(tv|television|monitor|display|oled|qled)\b/i,
    [
      { name: "display_quality", direction: "higher_is_better", weight: 0.15, rationale: "Panel quality is the core utility signal for displays." },
      { name: "input_latency", direction: "lower_is_better", weight: 0.10, rationale: "Latency matters for gaming, video calls, and interactive work." },
      { name: "software_support_years", direction: "higher_is_better", weight: 0.08, rationale: "Smart displays lose value when apps and security updates stop." },
      { name: "privacy", direction: "higher_is_better", weight: 0.07, rationale: "Smart TVs and monitors can collect viewing and device data." },
    ],
  ],
  [
    /\b(vacuum|robot_?vacuum|stick_?vacuum|roomba|roborock)\b/i,
    [
      { name: "cleaning_performance", direction: "higher_is_better", weight: 0.15, rationale: "Cleaning performance is the primary category outcome." },
      { name: "parts_availability", direction: "higher_is_better", weight: 0.10, rationale: "Brushes, filters, bags, and batteries determine long-run ownership cost." },
      { name: "repairability", direction: "higher_is_better", weight: 0.08, rationale: "Repairable vacuums avoid premature replacement." },
      { name: "noise", direction: "lower_is_better", weight: 0.07, rationale: "Noise determines whether the product can be used in normal living conditions." },
    ],
  ],
  [
    /\b(tires?|tyres?|brakes?|car_?battery|auto_?parts?|vehicle_?parts?)\b/i,
    [
      { name: "safety", direction: "higher_is_better", weight: 0.18, rationale: "Vehicle parts are safety-critical and should not be optimized on price alone." },
      { name: "fit_compatibility", direction: "higher_is_better", weight: 0.13, rationale: "A part must match the vehicle, trim, and use case." },
      { name: "wet_grip", direction: "higher_is_better", weight: 0.09, rationale: "Wet grip is a high-welfare tire performance signal." },
      { name: "tread_life", direction: "higher_is_better", weight: 0.08, rationale: "Durability determines long-run cost and replacement frequency." },
    ],
  ],
  [
    /\b(sunscreen|skincare|cosmetic|makeup|shampoo|lotion)\b/i,
    [
      { name: "ingredient_safety", direction: "higher_is_better", weight: 0.15, rationale: "Ingredient risk matters for products applied to skin or hair." },
      { name: "allergen_risk", direction: "lower_is_better", weight: 0.10, rationale: "Allergens and irritants are common hidden failure modes." },
      { name: "skin_type_fit", direction: "higher_is_better", weight: 0.09, rationale: "A product can be objectively good yet poor for a user's skin type." },
      { name: "return_window", direction: "higher_is_better", weight: 0.06, rationale: "Fit uncertainty makes return policies welfare-relevant." },
    ],
  ],
  [
    /\b(refrigerator|fridge|washer|dryer|dishwasher|appliance)\b/i,
    [
      { name: "energy_efficiency", direction: "higher_is_better", weight: 0.14, rationale: "Large appliances have meaningful recurring energy costs." },
      { name: "reliability", direction: "higher_is_better", weight: 0.12, rationale: "Failures impose repair cost and household disruption." },
      { name: "repairability", direction: "higher_is_better", weight: 0.10, rationale: "Parts and service access determine total cost of ownership." },
      { name: "warranty", direction: "higher_is_better", weight: 0.07, rationale: "Warranty terms are a quality and risk-shifting signal for appliances." },
    ],
  ],
  [
    /\b(subscription|software|app|service)\b/i,
    [
      { name: "total_cost", direction: "lower_is_better", weight: 0.16, rationale: "Subscriptions often hide annualized cost behind monthly framing." },
      { name: "cancellation_friction", direction: "lower_is_better", weight: 0.12, rationale: "Roach-motel cancellation is a direct consumer-welfare risk." },
      { name: "privacy", direction: "higher_is_better", weight: 0.10, rationale: "Software purchases often trade money for personal data exposure." },
      { name: "data_portability", direction: "higher_is_better", weight: 0.08, rationale: "Portability limits future lock-in." },
    ],
  ],
];

export function derivePreferenceIntent(
  intent: UserIntent,
  options: PreferenceInferenceOptions = {},
): UserIntent {
  const category = (intent.category ?? "product").trim() || "product";
  const rawCriteriaText = intent.rawCriteriaText ?? options.prompt ?? "";
  const layers: NonNullable<UserIntent["preferenceModel"]>["layers"] = [];
  let categorySignals = 0;
  let guardrailSignals = 0;

  const criteria = mergeCriteria(intent.criteria);
  if (criteria.length === 0) {
    criteria.push({
      name: "overall_quality",
      weight: 1,
      direction: "higher_is_better",
      confidence: 0.45,
      source: "default",
      rationale: "Lens had no usable preference signal, so it used a neutral fallback.",
    });
  }

  if (intent.budget?.max !== undefined && intent.budget.max > 0) {
    const price = findCriterion(criteria, "price");
    if (price) {
      price.weight += 0.12;
      price.confidence = Math.max(price.confidence ?? 0, 0.9);
      price.source = price.source ?? "budget";
      price.rationale = price.rationale ?? "The user's budget implies price sensitivity.";
    } else {
      criteria.push({
        name: "price",
        weight: 0.22,
        direction: "lower_is_better",
        confidence: 0.95,
        source: "budget",
        rationale: `Budget max ${intent.budget.currency} ${intent.budget.max} makes lower price part of the utility function.`,
      });
    }
  }

  const priors = priorsForCategory(category);
  for (const prior of priors) {
    if (criteria.length >= 8) break;
    if (findCriterion(criteria, prior.name)) continue;
    criteria.push({
      name: prior.name,
      weight: prior.weight,
      direction: prior.direction,
      confidence: 0.55,
      source: "category_prior",
      rationale: prior.rationale,
    });
    categorySignals++;
  }

  for (const guardrail of guardrailsForCategory(category)) {
    if (findCriterion(criteria, guardrail.name)) continue;
    criteria.push({
      name: guardrail.name,
      weight: guardrail.weight,
      direction: guardrail.direction,
      confidence: 0.5,
      source: "safety_guardrail",
      rationale: guardrail.rationale,
    });
    guardrailSignals++;
  }

  normalizeWeights(criteria);
  const confidence = aggregateConfidence(criteria);
  const needsClarification = criteria.some((c) => (c.confidence ?? 1) < 0.6) || confidence < 0.68;

  layers.push({
    layer: "stated",
    status: criteria.some((c) => c.source === "stated") || rawCriteriaText.trim() ? "used" : "missing",
    signals: criteria.filter((c) => c.source === "stated").length,
    rationale: rawCriteriaText.trim()
      ? "Parsed from the user's own words before ranking."
      : "No direct stated-preference text was available.",
  });
  layers.push({
    layer: "budget",
    status: intent.budget?.max !== undefined ? "used" : "missing",
    signals: intent.budget?.max !== undefined ? 1 : 0,
    rationale: intent.budget?.max !== undefined
      ? "Budget constraints are converted into an explicit price criterion."
      : "No budget was stated, so price is only used if the category or user text implies it.",
  });
  layers.push({
    layer: "category_prior",
    status: categorySignals > 0 ? "used" : "missing",
    signals: categorySignals,
    rationale: categorySignals > 0
      ? "Category priors fill common welfare-relevant attributes the user may not have named."
      : "The stated criteria already covered the available category priors.",
  });
  layers.push({
    layer: "profile",
    status: options.profileApplied ? "used" : "user_controlled",
    signals: options.profileApplied ? 1 : 0,
    rationale: options.profileApplied
      ? "An explicit saved profile contributed to the criteria."
      : "Saved profiles are user-controlled and can be ignored, edited, exported, or deleted.",
  });
  layers.push({
    layer: "revealed",
    status:
      options.revealedSignals && options.revealedSignals > 0
        ? "used"
        : options.revealedConsent
          ? "missing"
          : "requires_consent",
    signals: options.revealedSignals ?? 0,
    rationale:
      options.revealedSignals && options.revealedSignals > 0
        ? "Past accepted or rejected recommendations adjusted the priors."
        : "Purchase history, Plaid, email receipts, and behavior are never used without explicit consent.",
  });
  if (guardrailSignals > 0) {
    layers.push({
      layer: "guardrail",
      status: "used",
      signals: guardrailSignals,
      rationale: "Low-weight safety/privacy guardrails protect against narrow spec optimization.",
    });
  }

  return {
    ...intent,
    category,
    criteria,
    rawCriteriaText,
    preferenceModel: {
      version: "layered-utility-v1",
      confidence,
      needsClarification,
      layers,
      userControls: [
        "Edit or delete every criterion weight.",
        "Answer clarification questions instead of accepting inferred weights.",
        "Disable saved profiles, purchase history, email, Plaid, and push workflows independently.",
        "Export or delete the account-scoped preference profile.",
      ],
      privacy: {
        dataTier: options.localOnly ? "local_only" : "in_flight",
        usesExternalBehavior: (options.revealedSignals ?? 0) > 0,
        consentRequiredFor: [
          "Gmail receipt ingestion",
          "Plaid transaction monitoring",
          "server-side purchase history",
          "cross-device profile sync",
          "push notification watchers",
        ],
        retention: options.localOnly ? "device_local" : "per_request",
      },
    },
  };
}

function mergeCriteria(raw: Criterion[] | undefined): Criterion[] {
  const byName = new Map<string, Criterion>();
  for (const c of raw ?? []) {
    if (!c || typeof c.name !== "string") continue;
    const name = canonicalCriterionName(c.name);
    if (!name) continue;
    const weight = Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 1;
    const source: CriterionSource = c.source ?? "stated";
    const next: Criterion = {
      name,
      weight,
      direction: normalizeDirection(name, c.direction),
      ...(c.target !== undefined ? { target: c.target } : {}),
      confidence: clamp01(c.confidence ?? (source === "stated" ? 0.7 : 0.55)),
      source,
      rationale: c.rationale ?? "Inferred from the available shopping context.",
    };
    const existing = byName.get(name);
    if (!existing) {
      byName.set(name, next);
      continue;
    }
    existing.weight += next.weight;
    existing.confidence = Math.max(existing.confidence ?? 0, next.confidence ?? 0);
    existing.rationale = existing.rationale ?? next.rationale;
    if (PRICE_ALIASES.has(name)) existing.direction = "lower_is_better";
  }
  return [...byName.values()];
}

function normalizeWeights(criteria: Criterion[]): void {
  const total = criteria.reduce((s, c) => s + Math.max(0, c.weight || 0), 0) || 1;
  for (const c of criteria) {
    c.weight = Math.round((Math.max(0, c.weight || 0) / total) * 10_000) / 10_000;
  }
  const rounded = criteria.reduce((s, c) => s + c.weight, 0);
  const drift = Math.round((1 - rounded) * 10_000) / 10_000;
  if (drift !== 0 && criteria[0]) criteria[0].weight = Math.round((criteria[0].weight + drift) * 10_000) / 10_000;
}

function aggregateConfidence(criteria: Criterion[]): number {
  if (criteria.length === 0) return 0;
  const weighted = criteria.reduce((s, c) => s + c.weight * (c.confidence ?? 0.5), 0);
  return clamp01(Math.round(weighted * 100) / 100);
}

function findCriterion(criteria: Criterion[], name: string): Criterion | undefined {
  const canon = canonicalCriterionName(name);
  return criteria.find((c) => canonicalCriterionName(c.name) === canon);
}

function priorsForCategory(category: string): PriorCriterion[] {
  const forms = categoryForms(category);
  for (const [re, priors] of CATEGORY_PRIORS) {
    if (forms.some((form) => re.test(form))) return priors;
  }
  return [];
}

function guardrailsForCategory(category: string): PriorCriterion[] {
  const forms = categoryForms(category);
  const out: PriorCriterion[] = [];
  if (forms.some((c) => /\b(baby|child|toy|food|cosmetic|medical|health|vehicle|battery|charger|electrical|appliance)\b/i.test(c))) {
    out.push({
      name: "safety",
      direction: "higher_is_better",
      weight: 0.06,
      rationale: "Safety is a consumer-welfare floor for this category, even when unstated.",
    });
  }
  if (forms.some((c) => /\b(smart|app|software|subscription|camera|phone|speaker|tv|watch|tracker|iot)\b/i.test(c))) {
    out.push({
      name: "privacy",
      direction: "higher_is_better",
      weight: 0.06,
      rationale: "Connected products create privacy and data-sharing risk.",
    });
  }
  return out;
}

function normalizeCategory(category: string | undefined): string {
  const c = (category ?? "product").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return c || "product";
}

function categoryForms(category: string | undefined): string[] {
  const canon = normalizeCategory(category);
  return [canon, canon.replace(/_/g, " "), canon.replace(/_/g, "")];
}

function canonicalCriterionName(name: string): string {
  const n = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (PRICE_ALIASES.has(n)) return "price";
  if (n === "battery" || n === "runtime") return "battery_life";
  if (n === "build" || n === "materials") return "build_quality";
  if (n === "portable" || n === "weight" || n === "size") return "portability";
  return n;
}

function normalizeDirection(name: string, direction: CriterionDirection | undefined): CriterionDirection {
  const n = canonicalCriterionName(name);
  if (
    PRICE_ALIASES.has(n) ||
    n.endsWith("_cost") ||
    n === "noise" ||
    n === "cancellation_friction" ||
    // CATEGORY_PRIORS defines these as lower_is_better; without these branches a
    // criterion missing the direction field would silently invert (e.g., baby
    // products would score higher with MORE recalls).
    n === "recall_history" ||
    n === "allergen_risk" ||
    n === "input_latency"
  ) {
    return "lower_is_better";
  }
  return direction ?? "higher_is_better";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export function criteriaJsonToWeightMap(criteriaJson: string): Record<string, number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(criteriaJson);
  } catch {
    return {};
  }
  const out: Record<string, number> = {};
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.name !== "string") continue;
      const weight = typeof obj.weight === "number" ? obj.weight : Number(obj.weight);
      if (!Number.isFinite(weight)) continue;
      out[canonicalCriterionName(obj.name)] = weight;
    }
    return out;
  }
  if (parsed && typeof parsed === "object") {
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const weight = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(weight)) continue;
      out[canonicalCriterionName(key)] = weight;
    }
  }
  return out;
}

export function applyWeightMapToCriteriaJson(
  criteriaJson: string,
  weights: Record<string, number>,
): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(criteriaJson);
  } catch {
    return weights;
  }
  if (!Array.isArray(parsed)) return weights;

  const seen = new Set<string>();
  const updated: Criterion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.name !== "string") continue;
    const name = canonicalCriterionName(obj.name);
    const weight = weights[name];
    if (weight === undefined) continue;
    seen.add(name);
    const direction = normalizeDirection(name, obj.direction as CriterionDirection | undefined);
    updated.push({
      name,
      weight,
      direction,
      ...(typeof obj.target === "string" || typeof obj.target === "number" ? { target: obj.target } : {}),
      ...(typeof obj.confidence === "number" ? { confidence: obj.confidence } : {}),
      source: (obj.source as CriterionSource | undefined) ?? "revealed",
      rationale: typeof obj.rationale === "string" ? obj.rationale : "Adjusted from post-purchase feedback.",
    });
  }
  for (const [name, weight] of Object.entries(weights)) {
    if (seen.has(name)) continue;
    updated.push({
      name,
      weight,
      direction: normalizeDirection(name, undefined),
      confidence: 0.7,
      source: "revealed",
      rationale: "Added from post-purchase feedback.",
    });
  }
  return updated;
}
