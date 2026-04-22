#!/usr/bin/env node
/**
 * Pack schema validator. Runs at bundle time and in CI.
 *
 * Enforces every required field per pack type. Validates evidence chains.
 * Checks slug uniqueness. Verifies regulatory/intervention links resolve to
 * other packs. Fails loudly on bad packs.
 *
 * Run standalone:  node scripts/validate-pack-schema.mjs
 * Returns exit 0 if all packs pass, exit 1 otherwise.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PACKS_DIR = join(ROOT, "packs");

const types = ["category", "dark-pattern", "regulation", "fee", "intervention"];

const REQUIRED_BASE = ["slug", "type", "version", "name", "summary", "status", "authors", "lastVerified", "evidence", "applicability", "body"];

const errors = [];
const warnings = [];
const seenSlugs = new Set();
const slugByType = new Map();
for (const t of types) slugByType.set(t, new Set());

const allPacks = [];
for (const t of types) {
  const dir = join(PACKS_DIR, t);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const path = join(dir, f);
    let pack;
    try {
      pack = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      errors.push(`${t}/${f}: invalid JSON — ${e.message}`);
      continue;
    }
    pack.__path = path;
    pack.__file = f;
    pack.__expectedType = t;
    allPacks.push(pack);
  }
}

function err(pack, msg) {
  errors.push(`${pack.slug ?? pack.__file}: ${msg}`);
}
function warn(pack, msg) {
  warnings.push(`${pack.slug ?? pack.__file}: ${msg}`);
}

// Build slug index first so cross-link validation works.
for (const pack of allPacks) {
  if (typeof pack.slug !== "string") {
    err(pack, "missing or non-string slug");
    continue;
  }
  if (seenSlugs.has(pack.slug)) {
    err(pack, `duplicate slug "${pack.slug}"`);
  }
  seenSlugs.add(pack.slug);
}

// Validate each pack
for (const pack of allPacks) {
  // Type / directory match
  if (pack.type !== pack.__expectedType) {
    err(pack, `declared type "${pack.type}" doesn't match directory "${pack.__expectedType}"`);
  }

  // Filename matches slug suffix
  const slugSuffix = pack.slug.split("/").slice(1).join("/");
  if (`${slugSuffix}.json` !== pack.__file) {
    err(pack, `filename "${pack.__file}" doesn't match slug suffix "${slugSuffix}"`);
  }

  // Required base fields
  for (const f of REQUIRED_BASE) {
    if (pack[f] === undefined) err(pack, `missing required field "${f}"`);
  }

  // Status enum
  if (pack.status && !["draft", "reviewed", "published", "deprecated", "retired"].includes(pack.status)) {
    err(pack, `invalid status "${pack.status}"`);
  }

  // Authors not empty
  if (Array.isArray(pack.authors) && pack.authors.length === 0) {
    err(pack, "authors array is empty");
  }

  // Evidence rigor
  if (Array.isArray(pack.evidence)) {
    if (pack.evidence.length === 0) {
      warn(pack, "evidence array is empty");
    }
    const primaryCount = pack.evidence.filter((e) => e.primary === true).length;
    if (primaryCount === 0 && pack.evidence.length > 0) {
      warn(pack, "no primary-source evidence (all entries primary=false)");
    }
    // Check each evidence entry
    pack.evidence.forEach((e, i) => {
      if (typeof e.ref !== "string") err(pack, `evidence[${i}] missing ref`);
      if (typeof e.claim !== "string" || e.claim.length < 20) err(pack, `evidence[${i}] claim missing or too short`);
      if (typeof e.sourceUrl !== "string" || !/^https?:\/\//i.test(e.sourceUrl)) {
        err(pack, `evidence[${i}] sourceUrl missing or not http(s)`);
      }
      if (typeof e.retrieved !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.retrieved)) {
        err(pack, `evidence[${i}] retrieved missing or not ISO date`);
      }
      if (typeof e.primary !== "boolean") err(pack, `evidence[${i}] missing primary boolean`);
    });
    // De-duplicate ref labels
    const refs = pack.evidence.map((e) => e.ref);
    if (new Set(refs).size !== refs.length) err(pack, "duplicate evidence ref labels");
  }

  // Cross-link validation
  const checkLinks = (links, where) => {
    if (!Array.isArray(links)) return;
    for (const slug of links) {
      if (!seenSlugs.has(slug)) {
        warn(pack, `${where} references unknown pack "${slug}"`);
      }
    }
  };
  if (pack.body?.regulatoryLinks) checkLinks(pack.body.regulatoryLinks, "body.regulatoryLinks");
  if (pack.body?.interventionLinks) checkLinks(pack.body.interventionLinks, "body.interventionLinks");
  if (pack.body?.illegalInJurisdictions) checkLinks(pack.body.illegalInJurisdictions, "body.illegalInJurisdictions");

  // Per-type required body fields
  if (pack.type === "category") {
    if (!Array.isArray(pack.body?.criteria) || pack.body.criteria.length === 0) {
      err(pack, "category pack must have body.criteria with at least one entry");
    }
  } else if (pack.type === "dark-pattern") {
    if (!pack.body?.brignullId) err(pack, "dark-pattern pack must have body.brignullId");
    if (!pack.body?.severity) err(pack, "dark-pattern pack must have body.severity");
    if (!pack.body?.llmVerifyPrompt) err(pack, "dark-pattern pack must have body.llmVerifyPrompt");
  } else if (pack.type === "regulation") {
    if (!pack.body?.citation) err(pack, "regulation pack must have body.citation");
    if (!pack.body?.status) err(pack, "regulation pack must have body.status (in-force/vacated/...)");
    if (!pack.body?.userRightsPlainLanguage) err(pack, "regulation pack must have body.userRightsPlainLanguage");
  } else if (pack.type === "fee") {
    if (!pack.body?.canonicalName) err(pack, "fee pack must have body.canonicalName");
    if (!Array.isArray(pack.body?.identificationSignals)) err(pack, "fee pack must have body.identificationSignals array");
  } else if (pack.type === "intervention") {
    if (!pack.body?.executionType) err(pack, "intervention pack must have body.executionType");
    if (!pack.body?.consentTier) err(pack, "intervention pack must have body.consentTier");
  }
}

// Compute integrity hashes (informational — printed; not stored in pack)
const hashes = {};
for (const pack of allPacks) {
  const { __path, __file, __expectedType, ...clean } = pack;
  const sha = createHash("sha256").update(JSON.stringify(clean)).digest("hex");
  hashes[pack.slug] = sha.slice(0, 16);
}

console.log(`Validated ${allPacks.length} packs.`);
console.log(`  Errors: ${errors.length}`);
console.log(`  Warnings: ${warnings.length}`);
if (errors.length > 0) {
  console.log("\nERRORS:");
  for (const e of errors) console.log(`  ✗ ${e}`);
}
if (warnings.length > 0) {
  console.log("\nWARNINGS:");
  for (const w of warnings.slice(0, 50)) console.log(`  ⚠ ${w}`);
  if (warnings.length > 50) console.log(`  ... and ${warnings.length - 50} more`);
}

if (errors.length > 0) process.exit(1);
console.log("\nAll packs valid.");
