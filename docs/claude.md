# Project: equiPay

## Objective
`equiPay` is an open-source Chrome extension that streamlines reporting Pay Transparency Law violations to the New York State Department of Labor (NYS DOL). Without it, a reporter has to manually screenshot a job posting, convert it to PDF, navigate to the DOL's JavaServer Faces (`.faces`) complaint form, and hand-fill every field. equiPay automates evidence capture and pre-fills the complaint form, leaving the user to review, look up the employer's business address, and submit.

## License
MIT License

## End-to-end flow
1. User clicks the equiPay toolbar icon on a job posting (LinkedIn, Indeed, Glassdoor, etc.).
2. `content.js` is injected into the posting tab. It identifies the job-description element via a per-site parser, temporarily neutralizes `overflow`/`height` on the JD's scroll ancestors so the content flows into the natural document, and rasterizes the element with `html2canvas`.
3. The rasterized PNG is composed into a PDF via `jsPDF`: a metadata header (URL, timestamp, employer, job title, listed location) followed by the screenshot paginated across letter-sized pages.
4. The PDF is saved to the user's Downloads folder (`NYS_Violation_[Company].pdf`) and kept as a base64 data URL so it can be reused later for auto-upload.
5. `content.js` messages `background.js` with the extracted metadata + the PDF data URL. The service worker stashes everything in `chrome.storage.local` and opens a new tab to the NYS DOL complaint form.
6. On that tab's `status: complete`, `background.js` injects the bundled `dist/formfill.js`. The orchestrator picks a state adapter by `window.location.host`, loads the capture data + user profile from storage, runs the adapter's declared text-field / radio / explanation / upload / comments mappings against the DOM, and renders a dismissable review panel built from the adapter's `reviewPanel` config (requirements checklist, law links, business-address lookup helpers).

## Architecture & Technical Decisions

### Manifest V3
- Background is a service worker (stateless; we don't rely on in-memory state beyond a single message exchange).
- Script injection is via `chrome.scripting.executeScript` with `files:`, not declarative content scripts, so we can target arbitrary job-board URLs via `activeTab` without requesting `<all_urls>`.

### Activation model
- `activeTab` + toolbar-icon click is the only way the capture pipeline starts on a job-board page. This keeps the extension silent on every other page and avoids requiring broad host permissions for each board.
- `https://apps.labor.ny.gov/*` is declared in `host_permissions` because the DOL form tab is opened programmatically by the service worker and needs permission to have the form-fill bundle injected without a user click. Additional states' host patterns get added here when new adapters are registered.

### Evidence capture (`content.js`)
- A **pluggable parser registry** selects extractors by URL. Each parser returns `{ jdContainer, companyName, jobTitle, location, url? }`. A generic heuristic fallback handles unknown sites (main/article/largest text block; `og:site_name` / `og:title` for metadata).
- Seeded parsers: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, Greenhouse, Lever, Workday. New sites are added by appending an entry — no architectural change.
- Before rasterizing, `expandScrollAncestors` walks from the JD element up to `<html>`, setting `overflow: visible; height: auto; max-height: none; min-height: 0` on every ancestor that had a scroll/overflow/height constraint, then `html2canvas` renders the JD subtree at its natural `scrollWidth` × `scrollHeight`. A `finally` block restores the originals. This was the crucial fix for LinkedIn's nested-scroll-pane layout, where the JD lives inside an `overflow:auto` pane and normal rendering only captures the visible viewport.
- `html2canvas` is configured with `onclone` that strips `background-image`, `list-style-image`, and `<img>` `src` from the cloned subtree. Without this, html2canvas kicks off dozens of subresource fetches (LinkedIn's ad-tracking pixels, icon fonts, etc.) that fail noisily with `ERR_BLOCKED_BY_CLIENT` in the console. Text content — which is what matters for evidence — renders fine without them.
- PDF composition uses `jsPDF` directly (we do not use `html2pdf.js`, which wraps html2canvas with its own clone-and-render logic that re-introduces the subresource-fetch noise).

### LinkedIn URL normalization
- LinkedIn postings accumulate long query strings (`currentJobId`, tracking origin, keywords, etc.). The LinkedIn parser emits a canonical `https://www.linkedin.com/jobs/view/{id}/` URL for use in the PDF header and complaint form, keeping the evidence clean.

### Form-fill (`formfill/` → `dist/formfill.js`)
- **State-adapter registry.** `formfill/adapters/` contains one file per supported state. Each adapter exports a pure JSON-shaped config (no functions) describing how to fill that state's complaint form: host, waitForSelector, text-field mappings by label, radio/checkbox mappings by input `name`, conditional-explanation templates, comments-field template + sanitizer rule, file-input selector, and the review-panel content. The orchestrator in `formfill/index.js` reads `window.location.host` at runtime, picks the matching adapter, and runs the pipeline. Adding a new state is one new file in `adapters/` plus a registry entry in `adapters/index.js`.
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
| `background.js` | Service worker: action click → inject capture; handle `CAPTURE_COMPLETE` → open DOL tab + inject formfill |
| `content.js` | Parser registry, DOM expansion, html2canvas capture, jsPDF composition |
| `formfill/` (source) + `dist/formfill.js` (built) | State-adapter registry, library helpers, orchestrator; built via esbuild |
| `options.html` / `options.js` | Claimant profile editor |
| `icons/icon-{16,48,128}.png` + `icon.svg` | Toolbar + Web Store icons (generated via `npm run build-icons`) |
| `vendor/jspdf.umd.min.js` | 3rd-party PDF engine (vendored from `jspdf`) |
| `vendor/html2canvas.min.js` | 3rd-party DOM-to-canvas rasterizer (vendored from `html2canvas`) |
| `scripts/build-icons.mjs` | Build-time rasterizer for the icon SVG |
| `docs/claude.md`, `docs/STORE_LISTING.md` | Maintainer design notes + Web Store submission copy |
| `package.json` | npm deps + `sync-lib` + `build-icons` scripts |

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Inject capture scripts on whichever tab the user clicks equiPay on |
| `downloads` | Save the generated PDF |
| `scripting` | `executeScript` into the capture tab and the DOL form tab |
| `storage` | Claimant profile + per-capture data (`chrome.storage.local`) |
| `tabs` | Open the DOL tab + listen for its `status: complete` |
| `unlimitedStorage` | PDF data URLs can exceed the default 10MB quota on image-heavy postings |
| `host_permissions: https://apps.labor.ny.gov/*` | Inject the form-fill bundle into the programmatically-opened NY DOL form tab. Additional states' hosts are added here as adapters are registered. |

## Future Roadmap
- Additional state labor forms (CA, CO, WA have pay-transparency laws with similar filing flows).
- Additional job-board parsers; append to `PARSERS` in `content.js`.
- Richer evidence: timestamped capture of the salary-range field specifically, or the "lack thereof" metadata.
- Optional automated DOS/Secretary-of-State business-entity lookup, gated behind an explicit user toggle and with confidence scoring to avoid filing against the wrong legal entity.
