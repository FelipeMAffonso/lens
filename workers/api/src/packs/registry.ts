import type {
  Pack,
  PackRegistry,
  CategoryPack,
  DarkPatternPack,
  RegulationPack,
  FeePack,
  InterventionPack,
} from "@lens/shared";
import { ALL_PACKS } from "./all.generated.js";

/**
 * Pack registry — indexed lookup over the bundled packs.
 *
 * Built once at module load time. The registry lets the prompter and pipeline
 * stages select applicable packs by category, jurisdiction, page type, or
 * trigger in O(1) / O(small) per lookup.
 */
function buildRegistry(packs: Pack[]): PackRegistry {
  const bySlug = new Map<string, Pack>();
  const categoriesByAlias = new Map<string, CategoryPack>();
  const darkPatternsByPageType = new Map<string, DarkPatternPack[]>();
  const regulationsByJurisdiction = new Map<string, RegulationPack[]>();
  const feesByCategoryContext = new Map<string, FeePack[]>();
  const interventionsByTrigger = new Map<string, InterventionPack[]>();

  for (const pack of packs) {
    bySlug.set(pack.slug, pack);

    if (pack.type === "category") {
      const c = pack as CategoryPack;
      for (const alias of c.applicability.categoryAliases) {
        categoriesByAlias.set(alias.toLowerCase(), c);
      }
      for (const tag of c.applicability.productTags) {
        categoriesByAlias.set(tag.toLowerCase(), c);
      }
    } else if (pack.type === "dark-pattern") {
      const d = pack as DarkPatternPack;
      for (const pt of d.applicability.pageTypes) {
        const list = darkPatternsByPageType.get(pt) ?? [];
        list.push(d);
        darkPatternsByPageType.set(pt, list);
      }
    } else if (pack.type === "regulation") {
      const r = pack as RegulationPack;
      const list = regulationsByJurisdiction.get(r.applicability.jurisdiction) ?? [];
      list.push(r);
      regulationsByJurisdiction.set(r.applicability.jurisdiction, list);
    } else if (pack.type === "fee") {
      const f = pack as FeePack;
      const contexts = f.applicability.categoryContext.length > 0 ? f.applicability.categoryContext : ["*"];
      for (const ctx of contexts) {
        const list = feesByCategoryContext.get(ctx) ?? [];
        list.push(f);
        feesByCategoryContext.set(ctx, list);
      }
    } else if (pack.type === "intervention") {
      const i = pack as InterventionPack;
      for (const trig of i.applicability.triggerTypes) {
        const list = interventionsByTrigger.get(trig) ?? [];
        list.push(i);
        interventionsByTrigger.set(trig, list);
      }
    }
  }

  return {
    all: packs,
    bySlug,
    categoriesByAlias,
    darkPatternsByPageType,
    regulationsByJurisdiction,
    feesByCategoryContext,
    interventionsByTrigger,
  };
}

export const registry: PackRegistry = buildRegistry(
  ALL_PACKS.filter((p) => p.status === "published" || p.status === "reviewed"),
);

/**
 * Match a free-text category name against category packs' aliases.
 * Returns the best-matching pack or null.
 */
export function findCategoryPack(categoryText: string): CategoryPack | null {
  if (!categoryText) return null;
  const key = categoryText.trim().toLowerCase();

  // Exact alias match.
  const exact = registry.categoriesByAlias.get(key);
  if (exact) return exact;

  // Substring match either direction.
  for (const [alias, pack] of registry.categoriesByAlias.entries()) {
    if (key.includes(alias) || alias.includes(key)) return pack;
  }
  return null;
}

export function getRegulationsForJurisdiction(jurisdiction: string): RegulationPack[] {
  return (registry.regulationsByJurisdiction.get(jurisdiction) ?? []).filter(
    (r) => r.body.status === "in-force",
  );
}

export function getDarkPatternsForPageType(pageType: string): DarkPatternPack[] {
  const specific = registry.darkPatternsByPageType.get(pageType) ?? [];
  const global = registry.darkPatternsByPageType.get("any") ?? [];
  return [...specific, ...global];
}

export function getFeesForCategory(category: string): FeePack[] {
  const specific = registry.feesByCategoryContext.get(category) ?? [];
  const generic = registry.feesByCategoryContext.get("*") ?? [];
  return [...specific, ...generic];
}

export function getInterventionsForTrigger(trigger: string): InterventionPack[] {
  return registry.interventionsByTrigger.get(trigger) ?? [];
}

export function packStats(): Record<string, unknown> {
  return {
    totalPacks: registry.all.length,
    byType: {
      category: registry.all.filter((p) => p.type === "category").length,
      darkPattern: registry.all.filter((p) => p.type === "dark-pattern").length,
      regulation: registry.all.filter((p) => p.type === "regulation").length,
      fee: registry.all.filter((p) => p.type === "fee").length,
      intervention: registry.all.filter((p) => p.type === "intervention").length,
    },
    categoryAliases: registry.categoriesByAlias.size,
    regulationsByStatus: {
      inForce: registry.all
        .filter((p) => p.type === "regulation")
        .filter((p) => (p as RegulationPack).body.status === "in-force").length,
      vacated: registry.all
        .filter((p) => p.type === "regulation")
        .filter((p) => (p as RegulationPack).body.status === "vacated").length,
    },
  };
}
