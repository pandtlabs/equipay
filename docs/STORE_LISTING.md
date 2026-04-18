# Chrome Web Store Submission Prep

Copy-paste reference for the Chrome Web Store developer dashboard. Keep this file in the repo so future updates reuse the same copy.

---

## Listing basics

- **Extension name:** equiPay
- **Short description** (132 chars max): *One-click evidence capture + pre-filled NYS DOL complaint form for job postings that violate NY's Pay Transparency Law.*
- **Category:** Productivity (primary). Secondary: Accessibility / Legal Tools (whichever the dashboard offers).
- **Language:** English

## Detailed description (dashboard field)

```
equiPay helps New York workers and job-seekers file complaints for Pay Transparency Law (§194-b) violations.

The law requires most NY employers (4+ employees) to disclose a salary range in every job posting. When they don't, you can file a complaint with the NYS Department of Labor — but gathering evidence and filling out the 40+ field complaint form takes an hour of manual work.

equiPay does that work for you:

• CAPTURE: Click the toolbar icon on any job posting (LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, ZipRecruiter, Monster, Workday, or generic fallback). equiPay saves a clean PDF of the full job description with a timestamped URL header.

• PRE-FILL: equiPay opens the NYS DOL complaint form in a new tab and pre-fills your claimant info, the §194-b checkboxes, a standard explanation of the missing pay range, and attaches the PDF.

• REVIEW: Before you submit, a review panel walks you through the §194-b requirements (4+ employees, NY-based or NY-reporting, missing range). Helpers for the employer's registered business address (NY Dept. of State lookup, web search) keep you in control of that step.

equiPay never submits the complaint itself — you review and submit by hand.

100% local. No analytics, no telemetry, no external servers. Your claimant info stays in chrome.storage.local on your device. Full source code + MIT license: https://github.com/pandtlabs/equipay
```

## Single-purpose description (required)

```
Capture a job posting as PDF evidence and pre-fill the NYS Department of Labor Pay Transparency Law (§194-b) complaint form.
```

## Permission justifications

The dashboard asks for a one-line reason per permission. Copy these verbatim.

| Permission | Justification |
|---|---|
| `activeTab` | Required to read the job posting on the tab the user clicks equiPay on, so we can extract the employer, job title, and description. |
| `scripting` | Required to inject the capture script on the active job-posting tab and the form-fill script on the NYS DOL complaint form. |
| `downloads` | Required to save the generated evidence PDF to the user's Downloads folder. |
| `storage` | Required to store the user's claimant profile (set via the Options page) and to pass the generated PDF between the capture and form-fill steps. |
| `unlimitedStorage` | The generated evidence PDF can exceed Chrome's default 10MB per-item storage quota when the job posting is image-heavy. |
| `tabs` | Required to open the NYS DOL complaint form in a new tab after capture and to listen for its load-complete event so the form-fill script runs at the right moment. |
| Host permission: `https://apps.labor.ny.gov/*` | Required to inject the form-fill script into the programmatically-opened NYS DOL complaint form tab. This site is where the complaint is filed. |

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

## Screenshots (1280×800 recommended; at least one required)

Plan on producing these before submitting:

1. **equiPay active on a LinkedIn posting** — toolbar icon clicked, capture in progress.
2. **The generated PDF** — showing the metadata header + job description.
3. **The DOL form pre-filled** — visible claimant info, radios, and "No" on pay range.
4. **The review panel** — showing requirements checklist and address lookup buttons.

Capture at 1280×800 in a Chrome window with DevTools closed for a clean frame. macOS `Cmd+Shift+4` + space for a window screenshot works.

## Small promo tile (440×280) and marquee (1400×560)

Optional but help discoverability. Can be a stylized version of the icon + "equiPay — Pay Transparency, Filed Fast" tagline.

## Dashboard steps in order

1. Register at <https://chrome.google.com/webstore/devconsole> ($5 one-time).
2. Click **New Item**, upload a .zip of the extension directory (see below).
3. Fill the listing fields from this doc.
4. Upload icons (icons/icon-128.png is used on the listing page) and screenshots.
5. Paste the privacy policy URL.
6. Fill permission justifications.
7. Submit for review.

## Producing the upload zip

The Store accepts a zip of the extension folder. `node_modules/`, `scripts/`, SVG source, and dev-only files should not be shipped. Use:

```bash
cd /Users/peter/Projects/equipay
zip -r equipay-0.1.0.zip \
  manifest.json \
  background.js content.js formfill.js options.html options.js \
  vendor/jspdf.umd.min.js vendor/html2canvas.min.js \
  icons/icon-16.png icons/icon-48.png icons/icon-128.png
```

Verify the zip doesn't include `node_modules/`, `.git/`, `package*.json`, `docs/`, `scripts/`, or `icons/icon.svg`. Those are for development only.
