// F19 — anti-drift test: every `env.<NAME>` / `c.env.<NAME>` reference in the
// API worker source must be documented in ONE of:
//   (a) workers/api/.dev.vars.example
//   (b) workers/api/wrangler.toml [vars] section
//   (c) workers/api/wrangler.toml bindings (D1, KV, R2, Durable Objects)
//
// If a developer adds `env.NEW_SECRET` in code without adding `NEW_SECRET=`
// to .dev.vars.example, this test fails in CI. That's the whole point.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WORKER_ROOT = resolve(__dirname, "..");
const SRC_ROOT = resolve(WORKER_ROOT, "src");
const DEV_VARS_EXAMPLE = resolve(WORKER_ROOT, ".dev.vars.example");
const WRANGLER_TOML = resolve(WORKER_ROOT, "wrangler.toml");

// Names referenced in code that intentionally aren't worker-configurable
// (e.g. env.NODE_ENV for Node tooling or process.env nested accesses).
// Prefer the empty set; extend only with justification.
const IGNORED: ReadonlySet<string> = new Set<string>([
  "NODE_ENV", // test infra only
]);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function extractEnvNames(source: string): Set<string> {
  const names = new Set<string>();
  // matches env.FOO, c.env.FOO, this.env.FOO, but not this.env?.FOO[0]; the
  // all-caps+digits+underscore identifier is the env name we care about.
  const re = /\b(?:c\.)?(?:this\.)?env\.([A-Z][A-Z0-9_]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = m[1];
    if (name && !IGNORED.has(name)) names.add(name);
  }
  return names;
}

function parseDocumentedNames(devVarsContent: string): Set<string> {
  const names = new Set<string>();
  for (const line of devVarsContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    if (/^[A-Z][A-Z0-9_]*$/.test(name)) names.add(name);
  }
  return names;
}

function parseWranglerNames(tomlContent: string): { vars: Set<string>; bindings: Set<string> } {
  const vars = new Set<string>();
  const bindings = new Set<string>();

  // [vars] section — simple KEY = "..." form.
  const varsSection = /\[vars\]([\s\S]*?)(?=\n\[|\n*$)/.exec(tomlContent);
  if (varsSection?.[1]) {
    for (const line of varsSection[1].split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const name = trimmed.slice(0, eq).trim();
      if (/^[A-Z][A-Z0-9_]*$/.test(name)) vars.add(name);
    }
  }

  // bindings: d1_databases, kv_namespaces, r2_buckets, durable_objects.bindings
  const bindingRe = /\bbinding\s*=\s*"([A-Z][A-Z0-9_]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = bindingRe.exec(tomlContent)) !== null) {
    const name = m[1];
    if (name) bindings.add(name);
  }
  // Durable Object bindings use `name = "..."` instead of `binding = "..."`.
  const doSection = /\[\[durable_objects\.bindings\]\]([\s\S]*?)(?=\n\[\[|\n\[|\n*$)/g;
  let dm: RegExpExecArray | null;
  while ((dm = doSection.exec(tomlContent)) !== null) {
    const block = dm[1] ?? "";
    const nameMatch = /\bname\s*=\s*"([A-Z][A-Z0-9_]*)"/.exec(block);
    if (nameMatch?.[1]) bindings.add(nameMatch[1]);
  }

  return { vars, bindings };
}

describe("env parity — every env.<NAME> reference is documented", () => {
  const files = listSourceFiles(SRC_ROOT);
  const referenced = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const n of extractEnvNames(src)) referenced.add(n);
  }

  const devVars = readFileSync(DEV_VARS_EXAMPLE, "utf8");
  const documented = parseDocumentedNames(devVars);
  const toml = readFileSync(WRANGLER_TOML, "utf8");
  const { vars: tomlVars, bindings } = parseWranglerNames(toml);

  it("finds at least one env reference in the source tree", () => {
    expect(referenced.size).toBeGreaterThan(5);
  });

  it("finds .dev.vars.example entries", () => {
    expect(documented.size).toBeGreaterThan(3);
  });

  it("finds wrangler.toml bindings", () => {
    expect(bindings.has("LENS_D1")).toBe(true);
    expect(bindings.has("LENS_KV")).toBe(true);
    expect(bindings.has("LENS_R2")).toBe(true);
    expect(bindings.has("RATE_LIMIT_DO")).toBe(true);
  });

  it("every source-referenced env name is documented somewhere", () => {
    const undocumented: string[] = [];
    for (const name of referenced) {
      const isDoc = documented.has(name) || tomlVars.has(name) || bindings.has(name);
      if (!isDoc) undocumented.push(name);
    }
    if (undocumented.length > 0) {
      throw new Error(
        `[F19] The following env names are referenced in src/ but NOT documented in ` +
          `.dev.vars.example, wrangler.toml [vars], or wrangler.toml bindings: ` +
          `${undocumented.sort().join(", ")}. ` +
          `Add each one to the appropriate file (see docs/secrets.md).`,
      );
    }
    expect(undocumented).toEqual([]);
  });

  it("documents the critical secrets by name", () => {
    const critical = ["ANTHROPIC_API_KEY", "JWT_SECRET"];
    for (const c of critical) {
      expect(documented.has(c), `${c} must be in .dev.vars.example`).toBe(true);
    }
  });
});
