// Package the built extension into a Chrome Web Store upload zip.
// Only includes files the extension actually needs at runtime — source
// directories (formfill/, scripts/), docs, and repo metadata are excluded.
// Run with: npm run package
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const manifest = JSON.parse(await fs.readFile(resolve(root, "manifest.json"), "utf8"));
const outName = `equipay-${manifest.version}.zip`;
const outPath = resolve(root, outName);

const entries = [
  "manifest.json",
  "background.js",
  "content.js",
  "options.html",
  "options.js",
  "dist/formfill.js",
  "vendor/jspdf.umd.min.js",
  "vendor/html2canvas.min.js",
  "icons/icon-16.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

for (const entry of entries) {
  await fs.access(resolve(root, entry));
}

await fs.rm(outPath, { force: true });
execFileSync("zip", ["-r", "-X", outName, ...entries], { cwd: root, stdio: "inherit" });
console.log(`package: wrote ${outPath}`);
