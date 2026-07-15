# equiPay

Chrome extension that streamlines filing pay-transparency-law complaints. Ships with New York support today — [NYS Pay Transparency Law (§194-b)](https://www.nysenate.gov/legislation/laws/LAB/194-B) complaints filed with the [NYS Department of Labor](https://dol.ny.gov/pay-transparency), and, for jobs based in New York City, [NYC salary-transparency](https://www.nyc.gov/site/cchr/media/pay-transparency.page) reports (NYC Admin. Code § 8-107(32)) filed with the [NYC Commission on Human Rights](https://www.nyc.gov/site/cchr/about/report-discrimination.page), which is the agency that actually enforces NYC-employer violations. Architected as a per-jurisdiction adapter registry so other states with similar laws (CA SB 1162, CO Equal Pay for Equal Work Act, WA SHB 1795, etc.) can be added by dropping in one new adapter file.

When you see a job posting on LinkedIn (or other supported boards) that's missing a pay range, click the toolbar icon and pick the agency (or leave it on **Auto-detect** — your choice is remembered). equiPay then:

1. Captures the full job description as a PDF (with URL, timestamp, and metadata header).
2. Opens the matching complaint form — NYS DOL, or NYC CCHR for NYC-based jobs when auto-detecting — in a new tab. The review panel warns if the posting's location suggests the other agency, and a button switches over in one click.
3. Pre-fills your claimant info, the violation checkboxes, and a standard explanation.
4. Attempts to attach the PDF automatically — falls back to highlighting the file field if the form rejects the programmatic upload.
5. Shows a review panel with the law's requirements, a business-address lookup helper, and links to the statute so you can confirm before submitting. Fields that require your judgment (e.g. the CCHR form's "I acknowledge" checkbox) are deliberately left for you.

The extension never submits the complaint itself — it only prepares it for your review.

## Supported job boards
LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, Greenhouse, Lever, Workday.
A generic fallback handles unknown sites by finding the largest `<article>` / `<main>` block.

## Install (developer mode)

```bash
git clone https://github.com/pandtlabs/equipay.git
cd equipay
npm install    # fetches deps, syncs vendor/, builds icons, and produces dist/formfill.js
```

Then:
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this repo's root directory
4. Pin equiPay in the toolbar
5. Right-click the icon → **Options** → enter your claimant info (name, email, phone, address) and save

## Use

1. On a job posting that's missing a pay range, click the equiPay toolbar icon and pick the agency (Auto-detect / NYS DOL / NYC CCHR). Your pick is remembered for next time.
2. A PDF downloads; a new tab opens to the chosen form, pre-filled.
3. Read the review panel at the bottom-right. Confirm all the listed requirements apply (4+ employees, NY/NYC job, missing range, accurate claimant info) and answer any fields equiPay left blank.
4. Use the **🔍 NY DOS** or **🌐 Web search** buttons to find the employer's business address; paste it into the Business Information section.
5. If the PDF wasn't auto-attached, drag it from Downloads into the highlighted upload field.
6. Review everything, then submit.

## Development

After `npm install`, the repo is loadable as-is (`vendor/`, `icons/*.png`, and `dist/formfill.js` are all produced by the `postinstall` hook).

### Build commands

| Command | What it does |
|---|---|
| `npm run build` | Runs all three build steps below in sequence (default after `npm install`) |
| `npm run sync-lib` | Refreshes `vendor/jspdf.umd.min.js` + `vendor/html2canvas-pro.min.js` from `node_modules/` |
| `npm run build-icons` | Rasterizes `icons/icon.svg` → `icons/icon-{16,48,128}.png` via `sharp` |
| `npm run build-formfill` | Bundles `formfill/` (ES-module source) → `dist/formfill.js` via `esbuild` (IIFE, un-minified, Chrome 120 target) |
| `npm test` | Rebuilds the form-fill bundle, then runs the jsdom test suites in [test/](test/) (form fills against saved real form HTML, LinkedIn capture fallbacks, Trusted Types shim) |

### Reload flow while iterating

After editing files:

| If you changed… | Run… | Then… |
|---|---|---|
| `background.js`, `content.js`, `popup.*`, `jurisdictions.js`, `tt-shim.js`, `options.*`, `manifest.json`, anything in `vendor/` | *(nothing — not bundled)* | `chrome://extensions` → equiPay → ↻, then reload any tab you want to test on |
| Anything in `formfill/` | `npm run build-formfill` | reload extension + reload the DOL tab |
| `icons/icon.svg` | `npm run build-icons` | reload extension |
| `package.json` deps | `npm install` (triggers `sync-lib`) | reload extension |

Content scripts stay resident in tabs until you reload those tabs — always refresh the LinkedIn or DOL tab after reloading the extension.

### Source layout

```
formfill/
├── index.js              orchestrator (picks adapter by window.location.host)
├── lib/                  shared DOM / input / file-upload / sanitizer / review-panel helpers
└── adapters/
    ├── index.js          host → adapter registry
    ├── ny.js             declarative config for NYS DOL §194-b form
    └── nyc.js            declarative config for NYC CCHR report form (§ 8-107(32))
```

Adding a new state = one new file under `adapters/`, one entry in `adapters/index.js`, one host added to `manifest.json`'s `host_permissions`, and one entry in `jurisdictions.js` (which drives both the popup picker and the service worker's form-URL routing). See [docs/ADDING_A_STATE.md](docs/ADDING_A_STATE.md) for the step-by-step playbook, or [docs/claude.md](docs/claude.md) for full design notes.

## Release

For Chrome Web Store submission, produce a zip that contains the runtime files only — no `formfill/` source, `scripts/`, `docs/`, `node_modules/`, or `package*.json`. The exact zip command + per-permission justifications + listing copy live in [docs/STORE_LISTING.md](docs/STORE_LISTING.md).

Short version:

```bash
npm run package    # builds + writes equipay-<version>.zip with only runtime files
```

## Architecture

See [docs/claude.md](docs/claude.md) for the full design notes. TL;DR:

- **Manifest V3** with an action popup (agency picker: Auto-detect / NYS DOL / NYC CCHR, driven by `jurisdictions.js`) that injects the capture pipeline; the service worker routes messages and opens the complaint form for the chosen (or detected) jurisdiction.
- **Capture** uses `html2canvas-pro` (maintained html2canvas fork with modern-CSS color support) on the job-description element directly (not the viewport), after temporarily neutralizing `overflow` / `height` on scroll ancestors so the full content is in the natural document flow. If rasterization fails, the PDF falls back to the extracted job-description text so capture never hard-fails.
- **PDF composition** via `jsPDF` directly, with a metadata header and paginated screenshot.
- **Form-fill** uses a per-jurisdiction adapter registry: `formfill/adapters/ny.js` and `nyc.js` are pure declarative configs of input names, label keywords, and review-panel copy. The orchestrator + shared helpers live in `formfill/lib/`. esbuild bundles it into `dist/formfill.js`. Adding a new state is one new adapter file.
- **User profile** stored in `chrome.storage.local`; nothing leaves your browser.

## License

MIT
