// Strip remotely-hosted-code URLs from vendored libraries.
// Chrome Web Store MV3 review rejects any https URL pointing at a .js file
// inside extension code, even when the surrounding branch is unreachable.
// jsPDF's pdfobjectnewwindow output path hard-codes a cdnjs script URL; we
// never invoke that output mode, so blanking the literal keeps the library
// functional and the extension compliant. Run as part of `sync-lib` after
// the vendor copy, so a fresh `npm install` produces a clean bundle.
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const jspdfPath = resolve(here, "..", "vendor", "jspdf.umd.min.js");

const REMOTE_JS_URL = /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdfobject\/[^"']+\.js/g;

const source = await fs.readFile(jspdfPath, "utf8");
const stripped = source.replace(REMOTE_JS_URL, "");
if (stripped === source) {
  console.warn(`strip-remote-urls: no cdnjs pdfobject URL found in ${jspdfPath} — has jsPDF changed?`);
} else {
  await fs.writeFile(jspdfPath, stripped);
  console.log(`strip-remote-urls: scrubbed cdnjs pdfobject URL from ${jspdfPath}`);
}
