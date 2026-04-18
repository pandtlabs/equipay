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
6. On that tab's `status: complete`, `background.js` injects `formfill.js`. The form-fill script reads the capture data + the user's stored profile, answers the form via direct JSF `name`-attribute targeting, attempts to inject the PDF via `DataTransfer` on the file input, and renders a dismissable review panel that lists the §194-b requirements, links to the statute, and provides NY DOS + web-search helpers for the business-address lookup (which is deliberately left manual).

## Architecture & Technical Decisions

### Manifest V3
- Background is a service worker (stateless; we don't rely on in-memory state beyond a single message exchange).
- Script injection is via `chrome.scripting.executeScript` with `files:`, not declarative content scripts, so we can target arbitrary job-board URLs via `activeTab` without requesting `<all_urls>`.

### Activation model
- `activeTab` + toolbar-icon click is the only way the capture pipeline starts on a job-board page. This keeps the extension silent on every other page and avoids requiring broad host permissions for each board.
- `https://apps.labor.ny.gov/*` is declared in `host_permissions` because the DOL form tab is opened programmatically by the service worker and needs permission to have `formfill.js` injected without a user click.

### Evidence capture (`content.js`)
- A **pluggable parser registry** selects extractors by URL. Each parser returns `{ jdContainer, companyName, jobTitle, location, url? }`. A generic heuristic fallback handles unknown sites (main/article/largest text block; `og:site_name` / `og:title` for metadata).
- Seeded parsers: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, Greenhouse, Lever, Workday. New sites are added by appending an entry — no architectural change.
- Before rasterizing, `expandScrollAncestors` walks from the JD element up to `<html>`, setting `overflow: visible; height: auto; max-height: none; min-height: 0` on every ancestor that had a scroll/overflow/height constraint, then `html2canvas` renders the JD subtree at its natural `scrollWidth` × `scrollHeight`. A `finally` block restores the originals. This was the crucial fix for LinkedIn's nested-scroll-pane layout, where the JD lives inside an `overflow:auto` pane and normal rendering only captures the visible viewport.
- `html2canvas` is configured with `onclone` that strips `background-image`, `list-style-image`, and `<img>` `src` from the cloned subtree. Without this, html2canvas kicks off dozens of subresource fetches (LinkedIn's ad-tracking pixels, icon fonts, etc.) that fail noisily with `ERR_BLOCKED_BY_CLIENT` in the console. Text content — which is what matters for evidence — renders fine without them.
- PDF composition uses `jsPDF` directly (we do not use `html2pdf.js`, which wraps html2canvas with its own clone-and-render logic that re-introduces the subresource-fetch noise).

### LinkedIn URL normalization
- LinkedIn postings accumulate long query strings (`currentJobId`, tracking origin, keywords, etc.). The LinkedIn parser emits a canonical `https://www.linkedin.com/jobs/view/{id}/` URL for use in the PDF header and complaint form, keeping the evidence clean.

### Form-fill (`formfill.js`)
- **JSF `name`-based targeting** — the NYS DOL form's JSF component IDs are generated per render (`form:j_id_42` etc.) but the underlying `name` attributes on radios/checkboxes are stable (`typeComplainantSel`, `chooseFormA`, `rangeOfPay`, `typeAd`, etc.). `formfill.js` targets inputs by name + option text, avoiding the keyword-scope heuristics that earlier iterations used.
- **Text fields** are filled by label-text matching (scoped by section heading) — the names of text inputs are less stable but labels like "First Name" / "Business Name" are.
- **Conditional explanations** — after a "No" radio selection, JSF reveals a "please explain" textarea. `fillExplanationNearInput` walks up from the anchoring radio looking for the newly-visible textarea and populates it with a standard explanation.
- **File upload** — `formfill.js` attempts to set `input[type=file].files` via `DataTransfer`. If the form accepts it (still-set after a 1.5s settle), great. If JSF silently rejects, we fall back to highlighting the file input and prompting the user to drag the PDF in.
- **Review panel** — a fixed-position, dismissable panel in the bottom-right of the DOL tab that shows: §194-b requirements checklist, file-upload status, business-address lookup helpers (NY DOS public inquiry + web search + re-open posting), and links to the NY DOL Pay Transparency overview + the §194-b statute text. This is the intentional human-in-the-loop step: the extension will not (and should not) submit the complaint, and the panel exists to discourage misuse.

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
| `formfill.js` | JSF name-based field fill, file-upload attempt, review panel |
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
| `host_permissions: https://apps.labor.ny.gov/*` | Inject `formfill.js` into the programmatically-opened DOL form tab |

## Future Roadmap
- Additional state labor forms (CA, CO, WA have pay-transparency laws with similar filing flows).
- Additional job-board parsers; append to `PARSERS` in `content.js`.
- Richer evidence: timestamped capture of the salary-range field specifically, or the "lack thereof" metadata.
- Optional automated DOS/Secretary-of-State business-entity lookup, gated behind an explicit user toggle and with confidence scoring to avoid filing against the wrong legal entity.
