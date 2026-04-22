#!/usr/bin/env node
// F6 — extension bundler. Produces dist/ with:
//   content.js, background.js, sidebar/sidebar.js + sidebar/index.html + sidebar/sidebar.css,
//   manifest.json, popup.html, popup.js, icons/
import esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const SIDEBAR_OUT = join(DIST, "sidebar");

if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
if (!existsSync(SIDEBAR_OUT)) mkdirSync(SIDEBAR_OUT, { recursive: true });

const common = {
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  logLevel: "info",
};

await esbuild.build({
  ...common,
  entryPoints: [join(ROOT, "content.ts")],
  outfile: join(DIST, "content.js"),
});

await esbuild.build({
  ...common,
  entryPoints: [join(ROOT, "background.ts")],
  outfile: join(DIST, "background.js"),
});

await esbuild.build({
  ...common,
  entryPoints: [join(ROOT, "sidebar/sidebar.ts")],
  outfile: join(SIDEBAR_OUT, "sidebar.js"),
});

// Copy static sidebar assets
cpSync(join(ROOT, "sidebar/index.html"), join(SIDEBAR_OUT, "index.html"));
cpSync(join(ROOT, "sidebar/sidebar.css"), join(SIDEBAR_OUT, "sidebar.css"));

// Copy manifest + popup
cpSync(join(ROOT, "manifest.json"), join(DIST, "manifest.json"));
cpSync(join(ROOT, "popup.html"), join(DIST, "popup.html"));
cpSync(join(ROOT, "popup.js"), join(DIST, "popup.js"));

// Copy icons dir if it exists
const iconsSrc = join(ROOT, "icons");
if (existsSync(iconsSrc) && statSync(iconsSrc).isDirectory()) {
  const iconsDst = join(DIST, "icons");
  if (!existsSync(iconsDst)) mkdirSync(iconsDst, { recursive: true });
  for (const f of readdirSync(iconsSrc)) cpSync(join(iconsSrc, f), join(iconsDst, f));
}

console.log("✓ extension bundled → dist/");
