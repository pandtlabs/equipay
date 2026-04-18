# equiPay

Chrome extension that streamlines filing [New York Pay Transparency Law (§194-b)](https://www.nysenate.gov/legislation/laws/LAB/194-B) violations with the [NYS Department of Labor](https://dol.ny.gov/pay-transparency).

When you see a job posting on LinkedIn (or other supported boards) that's missing a pay range, one click:

1. Captures the full job description as a PDF (with URL, timestamp, and metadata header).
2. Opens the NYS DOL complaint form in a new tab.
3. Pre-fills your claimant info, the §194-b checkboxes, and a standard explanation.
4. Attempts to attach the PDF automatically — falls back to highlighting the file field if the form's JSF component rejects the programmatic upload.
5. Shows a review panel with the §194-b requirements, a business-address lookup helper, and links to the statute so you can confirm before submitting.

The extension never submits the complaint itself — it only prepares it for your review.

## Supported job boards
LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, Greenhouse, Lever, Workday.
A generic fallback handles unknown sites by finding the largest `<article>` / `<main>` block.

## Install (developer mode)

```bash
git clone https://github.com/pandtlabs/equipay.git
cd equipay
npm install    # fetches jspdf + html2canvas and syncs their bundles into the repo root
```

Then:
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this repo's root directory
4. Pin equiPay in the toolbar
5. Right-click the icon → **Options** → enter your claimant info (name, email, phone, address) and save

## Use

1. On a job posting that's missing a pay range, click the equiPay toolbar icon.
2. A PDF downloads; a new tab opens to the NYS DOL form, pre-filled.
3. Read the review panel at the bottom-right. Confirm all four requirements apply (4+ employees, NY job, missing range, accurate claimant info).
4. Use the **🔍 NY DOS** or **🌐 Web search** buttons to find the employer's business address; paste it into the Business Information section.
5. If the PDF wasn't auto-attached, drag it from Downloads into the highlighted upload field.
6. Review everything, then submit.

## Architecture

See [docs/claude.md](docs/claude.md) for the full design notes. TL;DR:

- **Manifest V3** service worker handles clicks and routes messages.
- **Capture** uses `html2canvas` on the job-description element directly (not the viewport), after temporarily neutralizing `overflow` / `height` on scroll ancestors so the full content is in the natural document flow.
- **PDF composition** via `jsPDF` directly, with a metadata header and paginated screenshot.
- **Form-fill** targets JSF inputs by their stable `name` attribute (generated IDs change per render; names don't).
- **User profile** stored in `chrome.storage.local`; nothing leaves your browser.

## License

MIT
