// Rasterize icons/icon.svg into the Chrome-extension-required PNG sizes.
// Run with: npm run build-icons
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "icons", "icon.svg");
const outDir = resolve(here, "..", "icons");
const sizes = [16, 48, 128];

const svg = await fs.readFile(src);
for (const size of sizes) {
  const out = resolve(outDir, `icon-${size}.png`);
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`wrote ${out}`);
}
