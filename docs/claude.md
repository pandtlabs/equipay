# Project: equiPay

## Objective
`equiPay` is an open-source Chrome extension that streamlines reporting Pay Transparency Law violations. Complaints route by jurisdiction: jobs based in New York City go to the NYC Commission on Human Rights (CCHR) report form (NYC Admin. Code § 8-107(32) — the CCHR, not the DOL, enforces NYC-employer violations and the DOL bounces those claims); everything else in NY state goes to the NYS Department of Labor's JSF complaint form (§194-b). Without it, a reporter has to manually screenshot a job posting, convert it to PDF, navigate to the right agency's form, and hand-fill every field. equiPay automates evidence capture and pre-fills the complaint form, leaving the user to review, look up the employer's business address, and submit.

## License
MIT License

## End-to-end flow
1. User clicks the equiPay toolbar icon on a job posting (LinkedIn, Indeed, Glassdoor, etc.) and picks an agency in the action popup — Auto-detect (default), NYS DOL, or NYC CCHR. The list is driven by `jurisdictions.js` (shared registry); the pick is persisted as `filingChoice` in `chrome.storage.local` and popup.js injects the capture pipeline into the active tab (`tt-shim.js` first, then the vendor libs, then `content.js`).
2. `content.js` is injected into the posting tab. It identifies the job-description element via a per-site parser, temporarily neutralizes `overflow`/`height` on the JD's scroll ancestors so the content flows into the natural document, and rasterizes the element with `html2canvas`.
3. The rasterized PNG is composed into a PDF via `jsPDF`: a metadata header (URL, timestamp, employer, job title, listed location) followed by the screenshot paginated across letter-sized pages.
4. The PDF is saved to the user's Downloads folder (`NYS_Violation_[Company].pdf` / `NYC_Violation_[Company].pdf`) and kept as a base64 data URL so it can be reused later for auto-upload. `content.js` also detects the jurisdiction (`nyc` vs `nys`) from the posting's listed location (borough/NYC keyword heuristic in `detectJurisdiction`, stored as `meta.jurisdictionDetected`); the user's popup pick overrides detection unless it's `auto` (`meta.jurisdiction`).
5. `content.js` messages `background.js` with the extracted metadata (including `meta.jurisdiction`) + the PDF data URL. The service worker stashes everything in `chrome.storage.local` and opens a new tab to the matching complaint form (`FORM_URLS` map: NYS DOL or NYC CCHR). The review panel renders a `switchForm` button that messages the worker (`OPEN_ALTERNATE_FORM`) to re-open the capture against the other agency, and shows a warning when `meta.jurisdictionDetected` points at the agency behind that button (i.e., the user is filing against the detection's suggestion).
6. On that tab's `status: complete`, `background.js` injects the bundled `dist/formfill.js`. The orchestrator picks a state adapter by `window.location.host`, loads the capture data + user profile from storage, runs the adapter's declared text-field / radio / explanation / upload / comments mappings against the DOM, and renders a dismissable review panel built from the adapter's `reviewPanel` config (requirements checklist, law links, business-address lookup helpers).

## Architecture & Technical Decisions

### Manifest V3
- Background is a service worker (stateless; we don't rely on in-memory state beyond a single message exchange).
- Script injection is via `chrome.scripting.executeScript` with `files:`, not declarative content scripts, so we can target arbitrary job-board URLs via `activeTab` without requesting `<all_urls>`.

### Activation model
- `activeTab` + toolbar-icon click (which opens the agency-picker popup; picking an agency injects the capture scripts from popup.js) is the only way the capture pipeline starts on a job-board page. This keeps the extension silent on every other page and avoids requiring broad host permissions for each board.
- `https://apps.labor.ny.gov/*`, `https://www.nyc.gov/site/cchr/*`, and `https://www1.nyc.gov/site/cchr/*` are declared in `host_permissions` because the complaint-form tab is opened programmatically by the service worker and needs permission to have the form-fill bundle injected without a user click. The nyc.gov patterns are path-scoped to the CCHR section to keep the grant narrow. Additional states' host patterns get added here when new adapters are registered.
- The `tabs` permission is deliberately absent: `tabs.create`/`tabs.get`/`tabs.onUpdated` work without it, and the worker matches its own created tab by `tabId` rather than by URL, so no broad tab-metadata access is needed.

### Evidence capture (`content.js`)
- A **pluggable parser registry** selects extractors by URL. Each parser returns `{ jdContainer, companyName, jobTitle, location, url? }`. A generic heuristic fallback handles unknown sites (main/article/largest text block; `og:site_name` / `og:title` for metadata).
- Seeded parsers: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, Greenhouse, Lever, Workday. New sites are added by appending an entry — no architectural change.
- **Selector-rot defenses:** the LinkedIn parser keeps a fallback chain across every class-name generation we've seen (logged-in + guest views), then falls back to selector-independent sources: schema.org JSON-LD `JobPosting` extraction (`readJobPostingLD`, guest views), the document title (`Job Title | Company | LinkedIn` — survives every redesign), the top card's `/company/` profile link, and a text-shape scan of the top card for `City, ST` / `… Metropolitan Area` location strings. If a parser matches but its JD-container selectors all miss, the orchestrator falls back to the generic largest-block heuristic instead of failing. If rasterization itself throws, the PDF is rendered from the JD's extracted text with a note in the header — evidence capture never hard-fails on a frontend redesign.
- Before rasterizing, `expandScrollAncestors` walks from the JD element up to `<html>`, setting `overflow: visible; height: auto; max-height: none; min-height: 0` on every ancestor that had a scroll/overflow/height constraint, then `html2canvas` renders the JD subtree at its natural `scrollWidth` × `scrollHeight`. A `finally` block restores the originals. This was the crucial fix for LinkedIn's nested-scroll-pane layout, where the JD lives inside an `overflow:auto` pane and normal rendering only captures the visible viewport.
- `html2canvas-pro` (maintained fork of the unmaintained html2canvas 1.4.1; adds modern CSS color support — `oklch()`, `lab()`, `color-mix()` — that broke capture on LinkedIn's redesign) is configured with `onclone` that strips `background-image`, `list-style-image`, and `<img>` `src` from the cloned subtree. Without this, html2canvas kicks off dozens of subresource fetches (LinkedIn's ad-tracking pixels, icon fonts, etc.) that fail noisily with `ERR_BLOCKED_BY_CLIENT` in the console. Text content — which is what matters for evidence — renders fine without them.
- PDF composition uses `jsPDF` directly (we do not use `html2pdf.js`, which wraps html2canvas with its own clone-and-render logic that re-introduces the subresource-fetch noise).
- **Trusted Types** (`tt-shim.js`, injected before the vendor libs): sites like LinkedIn enforce a `trusted-types` policy-name allowlist, which blocks html2canvas-pro's `createPolicy("html2canvas-pro")` even from the isolated world (Chromium checks policy creation against the page CSP — crbug.com/1281028 — while isolated-world DOM sinks follow the extension's CSP). The shim patches `TrustedTypePolicyFactory.prototype.createPolicy` in the isolated world to fall back to a pass-through pseudo-policy when creation throws.
- **JD-container strategies are instrumented**: the LinkedIn parser logs `equiPay: JD container via <strategy>` so field reports say exactly which selector generation matched. The class-independent strategies (the "About the job" heading walk, the `[class*="job-details"]` pane wrapper) keep captures tight on layouts we've never seen, instead of falling back to rasterizing all of `<main>`. All LinkedIn locators pierce open shadow roots (`deepQuery`/`deepQueryAll`), and ancestor walks (`parentOf`) hop shadow boundaries, in case a surface renders its panes inside web components.

### LinkedIn URL normalization
- LinkedIn postings accumulate long query strings (`currentJobId`, tracking origin, keywords, etc.). The LinkedIn parser emits a canonical `https://www.linkedin.com/jobs/view/{id}/` URL for use in the PDF header and complaint form, keeping the evidence clean.

### Form-fill (`formfill/` → `dist/formfill.js`)
- **Jurisdiction-adapter registry.** `formfill/adapters/` contains one file per supported jurisdiction (`ny.js`, `nyc.js`). Each adapter exports a pure JSON-shaped config (no functions) describing how to fill that form: `hosts` (or single `host`), waitForSelector, text-field mappings (targeted by stable input `name` via `inputName`, or by `labels` scoped to a `section`; values come from a `from` data path or a `template` with `{{substitutions}}` — complainant fields, capture date, posting metadata), `selectMappings` for dropdowns whose onchange reveals dependent inputs, radio/checkbox mappings by input `name`, conditional-explanation templates, comments-field template + sanitizer rule, file-input selector, and the review-panel content (including the `switchForm` cross-agency button). The orchestrator in `formfill/index.js` reads `window.location.host` at runtime, picks the matching adapter, and runs the pipeline. Adding a new state is one new file in `adapters/` plus a registry entry in `adapters/index.js`.
- **NYC CCHR form notes.** Plain HTML mailform with stable human-readable input names (`Your Name`, `Name of the person(s) and/or business`, `FILE1`…), so everything is name-targeted. Selecting "Employment" in the category dropdown fires the page's own `setBasis()`, which injects the `Basis Of Discrimination` checkboxes — the orchestrator fills selects before checkboxes for exactly this reason. Three fields are deliberately left blank for the user (and called out in the review panel): "Have you filed a complaint with us before?", "How did you hear about the Commission?", and the "I acknowledge" legal-acknowledgement checkbox.
- **Logic lives in `formfill/lib/`, never in adapters.** Shared DOM utilities (`dom.js`), radio/checkbox/label fills (`inputs.js`), file upload via DataTransfer (`file-upload.js`), named sanitizer rules (`sanitizers.js`), and the review-panel renderer (`review-panel.js`). When a future adapter needs a new capability, extend the library and add a declarative flag or rule name to the adapter config — don't let `ny.js` grow a helper function that `ca.js` then copies.
- **Why JSF `name`-based targeting?** NYS DOL form IDs regenerate per render (`form:j_id_42` etc.) but the underlying radio/checkbox `name` attributes are stable (`typeComplainantSel`, `chooseFormA`, `rangeOfPay`, etc.). Text inputs have less stable names, so those fall back to label-text matching scoped by section heading.
- **File upload** — `attemptFileUpload` sets `input[type=file].files` via `DataTransfer`. If the form keeps our file set after a 1.5s settle, we call it accepted; if JSF silently clears it, we fall back to scrolling to + highlighting the file input with a yellow outline so the user drags the PDF in manually.
- **Review panel** — dismissable bottom-right overlay, rendered from the adapter's `reviewPanel` config: requirements checklist, file-upload status + PDF preview button, business-address lookup helpers (action names like `clipboardAndOpen`, `webSearch`, `openUrl` resolve to implementations in `review-panel.js`), and footer law-links. This is the intentional human-in-the-loop step: the extension will not submit the complaint, and the panel exists to discourage misuse.

### Build (`esbuild`)
- `formfill/` is ES-module source. `npm run build-formfill` bundles `formfill/index.js` + all imports into a single `dist/formfill.js` wrapped as an IIFE (`--format=iife`, `--target=chrome120`, `--minify=false`).
- Why IIFE + un-minified? Chrome's `scripting.executeScript` with `files:` doesn't support native ES module injection reliably, and the Chrome Web Store flags minified bundles as "obfuscated" which delays review. The bundle is ~26 KB of readable code that passes review cleanly.
- `npm run build` runs `sync-lib` (vendor refresh) + `build-icons` + `build-formfill` together, wired as `postinstall` so a fresh clone + `npm install` produces a ready-to-load extension.

### User profile (`options.html` / `options.js`)
- Claimant info (name, email, phone, address) is stored in `chrome.storage.local` under the `complainant` key. Accessible via `chrome://extensions` → equiPay → Details → Extension options.
- Per-capture data (meta, description excerpt, PDF data URL) is stored under `pendingFill` and overwritten on each capture.

### What the extension deliberately does **not** do
- Auto-lookup the employer's business address. Picking the wrong legal entity for a complaint is worse than a blank field; the review panel provides lookup helpers and leaves the decision to the user.
- Submit the complaint. The review panel requires human confirmation of §194-b applicability.
- Call any external service or LLM. All processing is local.

## File layout

| File | Purpose |
|---|---|
| `manifest.json` | MV3 config, permissions, action + options page |
| `background.js` | Service worker: `CAPTURE_COMPLETE` → open form tab by jurisdiction + inject formfill; `OPEN_ALTERNATE_FORM` → switch agency |
| `popup.html` / `popup.js` | Action popup: agency picker (sticky `filingChoice`), injects the capture pipeline into the active tab |
| `tt-shim.js` | Isolated-world Trusted-Types fallback, injected before the vendor libs |
| `jurisdictions.js` | Shared registry (id, label, form URL) driving the popup list and the worker's `FORM_URLS` |
| `content.js` | Parser registry, DOM expansion, html2canvas capture, jsPDF composition |
| `formfill/` (source) + `dist/formfill.js` (built) | State-adapter registry, library helpers, orchestrator; built via esbuild |
| `options.html` / `options.js` | Claimant profile editor |
| `icons/icon-{16,48,128}.png` + `icon.svg` | Toolbar + Web Store icons (generated via `npm run build-icons`) |
| `vendor/jspdf.umd.min.js` | 3rd-party PDF engine (vendored from `jspdf`) |
| `vendor/html2canvas-pro.min.js` | 3rd-party DOM-to-canvas rasterizer (vendored from `html2canvas-pro`) |
| `scripts/build-icons.mjs` | Build-time rasterizer for the icon SVG |
| `docs/claude.md`, `docs/STORE_LISTING.md`, `docs/ADDING_A_STATE.md` | Design notes, Web Store copy, per-state adapter playbook |
| `package.json` | npm deps + `sync-lib` + `build-icons` scripts |

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Inject capture scripts on whichever tab the user clicks equiPay on |
| `scripting` | `executeScript` into the capture tab and the complaint-form tab |
| `storage` | Claimant profile + per-capture data (`chrome.storage.local`) |
| `unlimitedStorage` | PDF data URLs can exceed the default 10MB quota on image-heavy postings |
| `host_permissions: https://apps.labor.ny.gov/*`, `https://www.nyc.gov/site/cchr/*`, `https://www1.nyc.gov/site/cchr/*` | Inject the form-fill bundle into the programmatically-opened complaint-form tab (NYS DOL / NYC CCHR). Additional states' hosts are added here as adapters are registered. |

(`tabs` was removed in v0.2.0 — everything the worker does works without it, and dropping it removes the "read your browsing history" install warning.)

## Future Roadmap
- Additional state labor forms (CA, CO, WA have pay-transparency laws with similar filing flows).
- Additional job-board parsers; append to `PARSERS` in `content.js`.
- Richer evidence: timestamped capture of the salary-range field specifically, or the "lack thereof" metadata.
- Optional automated DOS/Secretary-of-State business-entity lookup, gated behind an explicit user toggle and with confidence scoring to avoid filing against the wrong legal entity.
