# Chrome Web Store Submission Prep

Copy-paste reference for the Chrome Web Store developer dashboard. Keep this file in the repo so future updates reuse the same copy.

---

## Listing basics

- **Extension name:** equiPay
- **Short description** (132 chars max): *One-click evidence capture + pre-filled pay-transparency complaint forms (NYS DOL & NYC CCHR; more states planned).*
- **Category:** Workflow & Planning (primary). Fallback: Tools. Don't pick Privacy & Security — that category is reserved for extensions whose core function is privacy/security (VPNs, password managers), not for any extension that happens to be privacy-respecting.
- **Language:** English

## Detailed description (dashboard field)

```
equiPay helps New York workers and job-seekers file complaints for pay-transparency violations.

New York State law (§194-b) and NYC's salary transparency law (Admin. Code § 8-107(32)) require most employers (4+ employees) to disclose a salary range in every job posting. When they don't, you can file a complaint — with the NYS Department of Labor, or with the NYC Commission on Human Rights for jobs based in New York City. But gathering evidence and filling out the complaint forms takes an hour of manual work.

equiPay does that work for you:

• CAPTURE: Click the toolbar icon on any job posting (LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, ZipRecruiter, Monster, Workday, or generic fallback). equiPay saves a clean PDF of the full job description with a timestamped URL header.

• ROUTE: pick the agency when you click the icon — or leave it on Auto-detect, which opens the NYS DOL complaint form or the NYC CCHR discrimination-report form based on the job's location. The review panel warns on a mismatch and switches agencies in one click.

• PRE-FILL: equiPay pre-fills your claimant info, the violation checkboxes, a standard explanation of the missing pay range, and attaches the PDF. Fields that require your judgment (like the CCHR form's legal acknowledgement) are left for you.

• REVIEW: Before you submit, a review panel walks you through the law's requirements (4+ employees, NY/NYC-based job, missing range). Helpers for the employer's registered business address (NY Dept. of State lookup, web search) keep you in control of that step.

equiPay never submits the complaint itself — you review and submit by hand.

COMING SOON: equiPay is built as a per-jurisdiction adapter registry. Additional states with pay-transparency laws (CA SB 1162, CO Equal Pay for Equal Work Act, WA SHB 1795, IL HB 3129, and others) will be added as their complaint-form flows are mapped. Today the extension supports New York State and New York City, and remains silent on every other site.

100% local. No analytics, no telemetry, no external servers. Your claimant info stays in chrome.storage.local on your device. Full source code + MIT license: https://github.com/pandtlabs/equipay
```

## Single-purpose description (required)

```
Capture a job posting as PDF evidence and pre-fill the matching New York pay-transparency complaint form (NYS DOL §194-b, or NYC CCHR § 8-107(32) for NYC-based jobs).
```

## Permission justifications

The dashboard asks for a one-line reason per permission. Copy these verbatim.

| Permission | Justification |
|---|---|
| `activeTab` | Required to read the job posting on the tab the user clicks equiPay on, so we can extract the employer, job title, and description. |
| `scripting` | Required to inject the capture script on the active job-posting tab and the form-fill script on the complaint form (NYS DOL / NYC CCHR). |
| `storage` | Required to store the user's claimant profile (set via the Options page) and to pass the generated PDF between the capture and form-fill steps. |
| `unlimitedStorage` | The generated evidence PDF can exceed Chrome's default 10MB per-item storage quota when the job posting is image-heavy. |
| Host permission: `https://apps.labor.ny.gov/*` | Required to inject the form-fill script into the programmatically-opened NYS DOL complaint form tab. This site is where NYS complaints are filed. |
| Host permission: `https://www.nyc.gov/site/cchr/*` | Required to inject the form-fill script into the programmatically-opened NYC Commission on Human Rights report form. Path-scoped to the CCHR section of nyc.gov. This page is where NYC complaints are filed. |
| Host permission: `https://www1.nyc.gov/site/cchr/*` | Same as above — nyc.gov serves the CCHR form from both the www and www1 hostnames. |

(v0.2.0 dropped the `tabs` permission: the worker only touches tabs it created, matched by tab ID, which needs no permission.)

## Data usage disclosures (required)

Chrome Web Store has a checklist of data types. For equiPay:

- **Personally identifiable information:** ✅ Stored locally (the claimant profile). Not transmitted.
- **Authentication info:** ❌ Not collected.
- **Financial info:** ❌ Not collected.
- **Health info:** ❌ Not collected.
- **Personal communications:** ❌ Not collected.
- **Location:** ❌ Not collected.
- **Web history:** ❌ Not collected.
- **User activity:** ❌ Not collected.
- **Website content:** ✅ Job-posting DOM is read on the active tab to capture the description. Not transmitted.

Certifications:
- ✅ I do not sell or transfer user data to third parties, except for the approved use cases.
- ✅ I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL

`https://pandtlabs.github.io/equipay/PRIVACY` — once GitHub Pages is enabled for the repo.
(Alternative: link directly to [PRIVACY.md](PRIVACY.md) on GitHub — the Store accepts a repo URL.)

## Screenshots (1280×800 PNG/JPEG; 1–5 accepted)

Four screenshots tell the story cleanly. Take them in this order:

1. **Context**: a job posting missing a pay range with equiPay pinned to the toolbar. The "this is what the tool works on" frame.
2. **Pre-filled DOL form**: scrolled to the 194-b section with radios selected + the Claimant section filled. The main value shot.
3. **Review panel close-up**: crop to the bottom-right panel showing the requirements checklist, PDF upload status, and address-lookup buttons. Communicates the human-in-the-loop design.
4. **Generated PDF**: opened in Chrome's PDF viewer, showing the metadata header + top of the screenshot.

### Prep before capturing

- **Use dummy claimant info.** Temporarily set your Options profile to `Jane Doe / jane.doe@example.com / 123 Main St` or similar before taking screenshots, then restore your real info. Don't leak your real address/phone to a public Store listing.
- **Redact or pick carefully for the employer shown.** Showing a specific employer as a "violator" in a public listing without actually filing is defamation-adjacent. Either blur the employer name or pick a posting that's genuinely missing a pay range from a company you're about to file against.
- **Capture at exactly 1280×800.** Chrome DevTools → Toggle Device Toolbar (Cmd+Shift+M) → custom size 1280×800 → use the "Capture screenshot" option in the device-emulation three-dot menu. Or macOS `Cmd+Shift+4` + drag-select a 1280×800 region.

## Small promo tile (440×280) and marquee (1400×560)

Optional but help discoverability. Can be a stylized version of the icon + "equiPay — Pay Transparency, Filed Fast" tagline.

## Producing the upload zip

The Store accepts a zip of the extension folder. `node_modules/`, `scripts/`, SVG source, and dev-only files should not be shipped. Use:

Run `npm run build` first to produce `dist/formfill.js` from the source in `formfill/`.

```bash
cd /path/to/equipay
npm run package    # builds + writes equipay-<version>.zip
```

The zip includes only: `manifest.json`, `background.js`, `content.js`, `tt-shim.js`, `jurisdictions.js`, `popup.html`, `popup.js`, `options.html`, `options.js`, `dist/formfill.js`, `vendor/jspdf.umd.min.js`, `vendor/html2canvas-pro.min.js`, and the three PNG icons (see `scripts/package.mjs`).

Verify the zip doesn't include `node_modules/`, `.git/`, `package*.json`, `docs/`, `scripts/`, `formfill/` (the un-bundled source), or `icons/icon.svg`. Those are for development only.
